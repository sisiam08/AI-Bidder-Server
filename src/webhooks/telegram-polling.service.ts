import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { TelegramCallbackService } from './telegram-callback.service';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      chat?: { id?: number | string };
      message_id?: number;
      reply_markup?: { inline_keyboard?: object[][] };
    };
  };
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    text?: string;
  };
}

@Injectable()
export class TelegramPollingService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramPollingService.name);
  private readonly offsets = new Map<string, number>();
  private readonly activeLoops = new Set<string>();
  private stopping = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly telegramCallbackService: TelegramCallbackService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const tokens = await this.collectBotTokens();
      for (const token of tokens) {
        if (!this.activeLoops.has(token)) {
          void this.runLoop(token);
        }
      }
      if (tokens.length > 0) {
        this.logger.log(
          `Telegram long-polling started for ${tokens.length} bot(s)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Telegram long-polling bootstrap failed: ${(error as Error).message}`,
      );
    }
  }

  onModuleDestroy() {
    this.stopping = true;
  }

  private async collectBotTokens(): Promise<string[]> {
    const tokens = new Set<string>();

    const envToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (envToken) tokens.add(envToken);

    const users = await this.prisma.user.findMany({
      where: { encryptedTelegramBotToken: { not: null } },
      select: { encryptedTelegramBotToken: true },
    });
    for (const user of users) {
      if (!user.encryptedTelegramBotToken) continue;
      try {
        tokens.add(this.crypto.decrypt(user.encryptedTelegramBotToken));
      } catch {
        this.logger.warn('Failed to decrypt Telegram bot token for a user');
      }
    }

    return [...tokens];
  }

  private async runLoop(token: string): Promise<void> {
    this.activeLoops.add(token);
    let backoffMs = 1_000;

    while (!this.stopping) {
      try {
        await this.pollOnce(token);
        backoffMs = 1_000;
      } catch (error) {
        const message = (error as Error).message;
        if (/webhook is active/i.test(message)) {
          this.logger.log(
            'Telegram webhook is active; long-polling disabled for this bot.',
          );
          break;
        }
        this.logger.warn(`Telegram getUpdates error: ${message}`);
        await this.delay(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }

    this.activeLoops.delete(token);
  }

  private async pollOnce(token: string): Promise<void> {
    const offset = this.offsets.get(token) ?? 0;
    const params = new URLSearchParams({
      timeout: '50',
      allowed_updates: '["callback_query","message"]',
    });
    if (offset) params.set('offset', String(offset));

    const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?${params}`);
    if (!res.ok) {
      throw new Error(`getUpdates HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      ok: boolean;
      result: TelegramUpdate[];
    };
    if (!body.ok) {
      throw new Error('getUpdates returned ok:false');
    }

    let maxId = offset;
    for (const update of body.result) {
      maxId = Math.max(maxId, update.update_id + 1);
      await this.handleUpdate(token, update);
    }
    this.offsets.set(token, maxId);
  }

  private async handleUpdate(token: string, update: TelegramUpdate) {
    await this.telegramCallbackService.handle(
      update,
      'telegram:polling',
      token,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
