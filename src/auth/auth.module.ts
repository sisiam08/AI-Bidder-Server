import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SessionService } from './session.service';
import { AuthController } from './auth.controller';

@Module({
  providers: [AuthService, AuthGuard, SessionService],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard, SessionService],
})
export class AuthModule {}
