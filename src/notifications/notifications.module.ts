import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TelegramProvider } from './providers/telegram.provider';

@Module({
  providers: [NotificationsService, TelegramProvider],
  exports: [NotificationsService, TelegramProvider],
})
export class NotificationsModule {}
