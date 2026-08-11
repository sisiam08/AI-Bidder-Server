import { Injectable, NotFoundException } from '@nestjs/common';
import { TelegramProvider } from './providers/telegram.provider';
import {
  JobNotification,
  DeliveryReceipt,
  BlockedBidNotification,
} from '../common/interfaces/job.interface';
import { NotificationCredentials } from './interfaces/notification-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly telegramProvider: TelegramProvider,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async send(
    userId: string,
    payload: JobNotification,
  ): Promise<DeliveryReceipt> {
    const credentials = await this.loadCredentials(userId);
    return this.telegramProvider.send(payload, credentials);
  }

  async sendBidBlocked(
    userId: string,
    payload: BlockedBidNotification,
  ): Promise<DeliveryReceipt> {
    const credentials = await this.loadCredentials(userId);
    return this.telegramProvider.sendBlocked(payload, credentials);
  }

  private async loadCredentials(
    userId: string,
  ): Promise<NotificationCredentials> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let botToken: string | undefined;
    if (user.encryptedTelegramBotToken) {
      try {
        botToken = this.crypto.decrypt(user.encryptedTelegramBotToken);
      } catch {
        botToken = undefined;
      }
    }

    return {
      botToken,
      chatId: user.telegramChatId || undefined,
    };
  }
}
