import { Module } from '@nestjs/common';
import { JobsGateway } from './jobs.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [JobsGateway],
  exports: [JobsGateway],
})
export class WebsocketModule {}
