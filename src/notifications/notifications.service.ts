import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TelegramProvider } from './providers/telegram.provider';
import {
  JobNotification,
  DeliveryReceipt,
  BlockedBidNotification,
} from '../common/interfaces/job.interface';
import { NotificationCredentials } from './interfaces/notification-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { buildJobUrl } from '../common/job-url';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly telegramProvider: TelegramProvider,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async send(
    userId: string,
    payload: JobNotification,
  ): Promise<DeliveryReceipt> {
    const credentials = await this.loadCredentials(userId);
    return this.telegramProvider.send(payload, credentials);
  }

  /**
   * Flips the original Telegram message from "Processing" to "Approved"
   * once the extension confirms the proposal form was filled successfully.
   */
  async confirmApproved(userId: string, jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job?.aiAnalysis) return;
    const status = job.status as string;
    if (status !== 'ReadyToFill' && status !== 'Approved') return;

    const credentials = await this.loadCredentials(userId);
    if (!credentials.botToken || !credentials.chatId) return;

    const notification = await this.prisma.notification.findFirst({
      where: { jobId, channel: 'TELEGRAM' },
    });
    const messageId = notification?.messageId;
    if (!messageId) return;

    const jobUrl = buildJobUrl(job.platform, job.externalJobId);
    const label = this.telegramProvider.buildApprovedLabel({
      suggestedBudget: job.aiAnalysis.suggestedBudget as
        | { amount: number; currency?: string }
        | null
        | undefined,
      suggestedTimeline: job.aiAnalysis.suggestedTimeline ?? undefined,
    });
    const text = `${this.telegramProvider.buildMessage(
      this.toNotification(job, jobUrl),
    )}\n\n✅ Approved`;

    await this.telegramProvider
      .editMessageText(
        credentials.botToken,
        credentials.chatId,
        Number(messageId),
        text,
        this.telegramProvider.buildStatusKeyboard(
          jobUrl ? [[{ text: 'View Job', url: jobUrl }]] : [],
          'approve',
          jobId,
          label,
        ),
      )
      .catch((error) => {
        this.logger.warn(
          `confirmApproved editMessageText failed: ${(error as Error).message}`,
        );
      });
  }

  /**
   * Rewrites the original Telegram job message so it no longer shows
   * "Approved" when the bid turns out to be restricted / not applicable.
   */
  async markBidBlocked(
    userId: string,
    payload: BlockedBidNotification,
  ): Promise<void> {
    const credentials = await this.loadCredentials(userId);
    if (!credentials.botToken || !credentials.chatId) return;

    const notification = await this.prisma.notification.findFirst({
      where: { jobId: payload.jobId, channel: 'TELEGRAM' },
    });
    const messageId = notification?.messageId;
    if (!messageId) return;

    const job = await this.prisma.job.findUnique({
      where: { id: payload.jobId },
      include: { aiAnalysis: true },
    });
    if (!job?.aiAnalysis) return;

    const full = this.toNotification(job, payload.jobUrl);

    const text = [
      this.telegramProvider.buildMessage(full),
      '',
      '🚫 Not Applicable — Bid blocked',
      ...payload.reasons.map((reason) => `• ${reason}`),
    ].join('\n');

    await this.telegramProvider
      .editMessageText(
        credentials.botToken,
        credentials.chatId,
        Number(messageId),
        text,
        this.telegramProvider.buildBlockedStatusKeyboard(
          payload.jobId,
          payload.jobUrl,
        ),
      )
      .catch((error) => {
        this.logger.warn(
          `markBidBlocked editMessageText failed: ${(error as Error).message}`,
        );
      });
  }

  private toNotification(
    job: {
      id: string;
      platform: string;
      title: string;
      skills: string[];
      budget: unknown;
      clientInfo: unknown;
      aiAnalysis: {
        summary: string;
        suggestedProposal: string;
        suggestedBudget: unknown;
        suggestedTimeline?: string | null;
      } | null;
    },
    jobUrl: string,
  ): JobNotification {
    if (!job.aiAnalysis) {
      throw new Error('Job has no AI analysis');
    }
    return {
      jobId: job.id,
      platform: job.platform,
      title: job.title,
      jobUrl,
      budget: job.budget as JobNotification['budget'],
      clientTimeline: this.clientTimeline(job.clientInfo),
      aiSummary: job.aiAnalysis.summary,
      skills: job.skills,
      suggestedProposal: job.aiAnalysis.suggestedProposal,
      suggestedBudget: job.aiAnalysis.suggestedBudget as
        | { amount: number; currency: string }
        | undefined,
      suggestedTimeline: job.aiAnalysis.suggestedTimeline ?? undefined,
    };
  }

  private async loadCredentials(
    userId: string,
  ): Promise<NotificationCredentials> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let botToken: string | undefined;
    if (user.encryptedTelegramBotToken) {
      try {
        botToken = this.crypto.decrypt(user.encryptedTelegramBotToken);
      } catch {
        botToken = undefined;
      }
    }

    return {
      botToken,
      chatId: user.telegramChatId || undefined,
    };
  }

  private clientTimeline(clientInfo: unknown): string | undefined {
    if (!clientInfo || typeof clientInfo !== 'object') return undefined;
    const timeline = (clientInfo as Record<string, unknown>).timeline;
    return typeof timeline === 'string' && timeline.trim()
      ? timeline.trim()
      : undefined;
  }
}
