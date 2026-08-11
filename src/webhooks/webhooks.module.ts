import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TelegramCallbackService } from './telegram-callback.service';
import { TelegramPollingService } from './telegram-polling.service';
import { ApprovalModule } from '../approval/approval.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ApprovalModule, NotificationsModule],
  controllers: [WebhooksController],
  providers: [TelegramCallbackService, TelegramPollingService],
})
export class WebhooksModule {}
