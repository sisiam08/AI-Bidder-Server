import { Module } from '@nestjs/common';
import { JobPipelineService } from './job-pipeline.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [AiModule, NotificationsModule, WebsocketModule],
  providers: [JobPipelineService],
  exports: [JobPipelineService],
})
export class PipelineModule {}
