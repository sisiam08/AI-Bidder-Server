import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';

@Controller('v1/health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const db = await this.prisma.ping();
    if (!db) {
      res.status(503);
    }
    return {
      status: db ? 'ok' : 'degraded',
      db: db ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
