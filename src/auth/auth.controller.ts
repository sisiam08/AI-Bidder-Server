import { Body, Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  SessionService,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from './session.service';
import { SetupUserDto } from '../common/dto/setup-user.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
  ) {}

  @Post('setup')
  @HttpCode(200)
  async setup(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: SetupUserDto,
  ) {
    const user = await this.authService.setupUser(dto);
    const token = this.sessionService.create(user);

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    });

    return {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}
