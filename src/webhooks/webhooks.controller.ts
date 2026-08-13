import { Controller, Post, Body, HttpCode, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramCallbackService } from './telegram-callback.service';

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private telegramCallbackService: TelegramCallbackService,
    private configService: ConfigService,
  ) {}

  @Post('telegram')
  @HttpCode(200)
  async telegramWebhook(
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');
    if (secret && headers[TELEGRAM_SECRET_HEADER] !== secret) {
      this.logger.warn('Rejected Telegram webhook with invalid secret token');
      return { ok: false };
    }

    return this.telegramCallbackService.handle(body, 'webhook:telegram');
  }
}
