import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prisma = new (PrismaClient as any)({
    adapter: new PrismaPg(
      new Pool({ connectionString: process.env['DATABASE_URL'] }),
    ),
  }) as PrismaClientInstance;

  get user() {
    return this.prisma.user;
  }
  get job() {
    return this.prisma.job;
  }
  get aiAnalysis() {
    return this.prisma.aiAnalysis;
  }
  get proposal() {
    return this.prisma.proposal;
  }
  get jobStatusHistory() {
    return this.prisma.jobStatusHistory;
  }
  get notification() {
    return this.prisma.notification;
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
