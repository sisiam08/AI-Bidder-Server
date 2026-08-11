import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

@Module({
  imports: [AuthModule, WebsocketModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
