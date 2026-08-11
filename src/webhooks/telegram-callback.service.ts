import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ApprovalService } from '../approval/approval.service';
import { TelegramProvider } from '../notifications/providers/telegram.provider';
import { JobNotification } from '../common/interfaces/job.interface';
import { buildJobUrl } from '../common/job-url';

interface TelegramCallbackQuery {
  id?: string;
  data?: string;
  message?: {
    chat?: { id?: number | string };
    message_id?: number;
    reply_markup?: { inline_keyboard?: object[][] };
  };
}

@Injectable()
export class TelegramCallbackService {
  private readonly logger = new Logger(TelegramCallbackService.name);

  constructor(
    private readonly approvalService: ApprovalService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly telegramProvider: TelegramProvider,
    private readonly configService: ConfigService,
  ) {}

  async handle(
    body: unknown,
    actor: string,
    knownToken?: string,
  ): Promise<{ ok: boolean }> {
    const update = body as { callback_query?: TelegramCallbackQuery };

    if (update.callback_query) {
      return this.handleCallback(update.callback_query, actor, knownToken);
    }
    return { ok: true };
  }

  private async handleCallback(
    callback: TelegramCallbackQuery,
    actor: string,
    knownToken?: string,
  ): Promise<{ ok: boolean }> {
    const data = callback.data;
    if (!data) return { ok: true };

    const parts = data.split(':');
    const action = parts[0];
    
    
    
    const jobId =
      action === 'step'
        ? parts[3]
        : action === 'edit' || action === 'done' || action === 'label'
          ? parts[2]
          : parts[1];
    const callbackId = callback.id;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;

    if (!callbackId || !chatId || !messageId) return { ok: true };

    const botToken = knownToken ?? (await this.resolveBotToken(jobId));
    if (!botToken) return { ok: true };

    
    if (action === 'edit' && (parts[1] === 'budget' || parts[1] === 'days')) {
      return this.enterEditMode(callback, parts[1], botToken);
    }

    
    if (
      action === 'step' &&
      (parts[1] === 'budget' || parts[1] === 'days') &&
      (parts[2] === 'inc' || parts[2] === 'dec')
    ) {
      return this.applyStep(callback, parts[1], parts[2], botToken);
    }

    
    
    if (action === 'done' && (parts[1] === 'budget' || parts[1] === 'days')) {
      return this.exitEditMode(callback, jobId, parts[1], botToken);
    }

    
    if (action === 'approve' || action === 'reject') {
      return this.finalize(callback, jobId, action, actor, botToken);
    }

    
    if (action === 'label' && (parts[1] === 'budget' || parts[1] === 'days')) {
      const payload = await this.loadNotification(jobId);
      const value =
        parts[1] === 'budget'
          ? payload
            ? this.formatBudgetAmount(
                payload.suggestedBudget?.amount ?? 0,
                payload.suggestedBudget?.currency ?? 'USD',
              )
            : null
          : payload?.suggestedTimeline
            ? this.timelineToDays(payload.suggestedTimeline)
            : null;
      await this.answer(
        botToken,
        callbackId,
        value !== null ? `Current value: ${value}` : 'No value set.',
      );
      return { ok: true };
    }

    await this.answer(
      botToken,
      callbackId,
      'This request has already been processed.',
    );
    return { ok: true };
  }

  private async enterEditMode(
    callback: TelegramCallbackQuery,
    field: 'budget' | 'days',
    botToken: string,
  ): Promise<{ ok: boolean }> {
    const jobId = (callback.data as string).split(':')[2];
    const chatId = callback.message?.chat?.id as string | number;
    const messageId = callback.message?.message_id as number;
    const callbackId = callback.id as string;

    if (!jobId || !chatId || !messageId) return { ok: true };

    const payload = await this.loadNotification(jobId);
    if (!payload) {
      await this.answer(botToken, callbackId, 'Could not load this job.');
      return { ok: true };
    }

    const keyboard =
      field === 'budget'
        ? this.telegramProvider.buildBudgetEditKeyboard(payload)
        : this.telegramProvider.buildDaysEditKeyboard(payload);

    await this.telegramProvider
      .editMessageReplyMarkup(botToken, chatId, messageId, keyboard)
      .catch((error) => {
        this.logger.warn(
          `editMessageReplyMarkup for edit mode failed: ${(error as Error).message}`,
        );
      });

    await this.answer(
      botToken,
      callbackId,
      field === 'budget'
        ? 'Adjust the budget with the + / - buttons'
        : 'Adjust the days with the + / - buttons',
    );

    return { ok: true };
  }

  private async applyStep(
    callback: TelegramCallbackQuery,
    field: 'budget' | 'days',
    direction: 'inc' | 'dec',
    botToken: string,
  ): Promise<{ ok: boolean }> {
    const data = callback.data as string;
    const parts = data.split(':');
    const jobId = parts[3];
    const chatId = callback.message?.chat?.id as string | number;
    const messageId = callback.message?.message_id as number;
    const callbackId = callback.id as string;

    if (!jobId || !chatId || !messageId) return { ok: true };

    const payload = await this.loadNotification(jobId);
    if (!payload) {
      await this.answer(botToken, callbackId, 'Could not load this job.');
      return { ok: true };
    }

    const step = field === 'budget' ? 50 : 5;
    const current =
      field === 'budget'
        ? (payload.suggestedBudget?.amount ?? 0)
        : ((payload.suggestedTimeline
            ? this.timelineToDays(payload.suggestedTimeline)
            : 0) ?? 0);
    const delta = direction === 'inc' ? step : -step;
    const next = Math.max(1, Math.round((current + delta) * 100) / 100);

    await this.updateProposalValue(jobId, field, next);

    const updated = await this.loadNotification(jobId);
    if (!updated) return { ok: true };

    const keyboard =
      field === 'budget'
        ? this.telegramProvider.buildBudgetEditKeyboard(updated)
        : this.telegramProvider.buildDaysEditKeyboard(updated);

    await this.telegramProvider
      .editMessageText(
        botToken,
        chatId,
        messageId,
        this.telegramProvider.buildMessage(updated),
        keyboard,
      )
      .catch((error) => {
        this.logger.warn(
          `editMessageText after step failed: ${(error as Error).message}`,
        );
      });

    const label =
      field === 'budget'
        ? this.formatBudgetAmount(
            next,
            updated.suggestedBudget?.currency ?? 'USD',
          )
        : `${next} Day${next === 1 ? '' : 's'}`;
    await this.answer(
      botToken,
      callbackId,
      field === 'budget' ? `Budget: ${label}` : `Days: ${label}`,
    );

    return { ok: true };
  }

  private async exitEditMode(
    callback: TelegramCallbackQuery,
    jobId: string,
    field: 'budget' | 'days',
    botToken: string,
  ): Promise<{ ok: boolean }> {
    const chatId = callback.message?.chat?.id as string | number;
    const messageId = callback.message?.message_id as number;
    const callbackId = callback.id as string;

    if (!chatId || !messageId) return { ok: true };

    const payload = await this.loadNotification(jobId);
    if (!payload) {
      await this.answer(botToken, callbackId, 'Could not load this job.');
      return { ok: true };
    }

    await this.telegramProvider
      .editMessageText(
        botToken,
        chatId,
        messageId,
        this.telegramProvider.buildMessage(payload),
        this.telegramProvider.buildProposalKeyboard(payload),
      )
      .catch((error) => {
        this.logger.warn(
          `editMessageText after Done failed: ${(error as Error).message}`,
        );
      });

    await this.answer(
      botToken,
      callbackId,
      field === 'budget' ? 'Budget updated' : 'Days updated',
    );

    return { ok: true };
  }

  private async finalize(
    callback: TelegramCallbackQuery,
    jobId: string,
    outcome: 'approve' | 'reject',
    actor: string,
    botToken: string,
  ): Promise<{ ok: boolean }> {
    const chatId = callback.message?.chat?.id as string | number;
    const messageId = callback.message?.message_id as number;
    const callbackId = callback.id as string;

    if (!chatId || !messageId) return { ok: true };

    try {
      if (outcome === 'approve') {
        await this.approvalService.approve(jobId, actor);
      } else {
        await this.approvalService.reject(jobId, actor);
      }
    } catch (error) {
      this.logger.warn(
        `Callback ${outcome} for job ${jobId} failed: ${(error as Error).message}`,
      );
      await this.answer(botToken, callbackId, 'Could not process request.');
      return { ok: false };
    }

    const payload = await this.loadNotification(jobId);
    const label =
      outcome === 'approve' ? await this.buildApprovedLabel(jobId) : undefined;

    const originalKeyboard: object[][] = payload?.jobUrl
      ? [[{ text: 'View Job', url: payload.jobUrl }]]
      : [];
    const statusLabel =
      outcome === 'approve' ? `✅ ${label ?? 'Approved'}` : 'Rejected';
    const newKeyboard = this.telegramProvider.buildStatusKeyboard(
      originalKeyboard,
      outcome,
      jobId,
      statusLabel,
    );

    const messageText = payload
      ? `${this.telegramProvider.buildMessage(payload)}\n\n${
          outcome === 'approve' ? '✅ Approved' : '❌ Rejected'
        }`
      : undefined;

    await this.telegramProvider
      .editMessageText(
        botToken,
        chatId,
        messageId,
        messageText ?? '',
        newKeyboard,
      )
      .catch((error) => {
        this.logger.warn(
          `editMessageText after finalize failed: ${(error as Error).message}`,
        );
      });

    await this.answer(
      botToken,
      callbackId,
      outcome === 'approve' ? '✅ Job approved' : 'Job rejected',
    );

    return { ok: true };
  }

  private async updateProposalValue(
    jobId: string,
    field: 'budget' | 'days',
    value: number,
  ) {
    const analysis = await this.prisma.aiAnalysis.findUnique({
      where: { jobId },
    });
    if (!analysis) return;

    if (field === 'budget') {
      const existing = (analysis.suggestedBudget ?? {}) as {
        amount?: number;
        currency?: string;
      };
      await this.prisma.aiAnalysis.update({
        where: { jobId },
        data: {
          suggestedBudget: {
            amount: Math.round(value * 100) / 100,
            currency: existing.currency ?? 'USD',
          },
        },
      });
    } else {
      const days = Math.max(1, Math.round(value));
      await this.prisma.aiAnalysis.update({
        where: { jobId },
        data: { suggestedTimeline: `${days} day${days === 1 ? '' : 's'}` },
      });
    }
  }

  private async loadNotification(
    jobId: string,
  ): Promise<JobNotification | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job || !job.aiAnalysis) return null;

    return {
      jobId: job.id,
      platform: job.platform,
      title: job.title,
      jobUrl: buildJobUrl(job.platform, job.externalJobId),
      budget: job.budget as JobNotification['budget'],
      aiSummary: job.aiAnalysis.summary,
      skills: job.skills,
      suggestedProposal: job.aiAnalysis.suggestedProposal,
      suggestedBudget: job.aiAnalysis.suggestedBudget as
        { amount: number; currency: string } | undefined,
      suggestedTimeline: job.aiAnalysis.suggestedTimeline ?? undefined,
    };
  }

  private async buildApprovedLabel(jobId: string): Promise<string | undefined> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job?.aiAnalysis) return undefined;

    const parts: string[] = [];

    const budget = job.aiAnalysis.suggestedBudget as {
      amount?: number;
      currency?: string;
    } | null;
    if (budget?.amount !== undefined && budget.amount !== null) {
      const symbol =
        CURRENCY_SYMBOLS[budget.currency?.toUpperCase() ?? ''] ?? '';
      parts.push(`${symbol}${budget.amount}`);
    }

    const timeline = job.aiAnalysis.suggestedTimeline;
    if (timeline) {
      const days = this.timelineToDays(timeline);
      if (days !== null) parts.push(`${days} Days`);
    }

    return parts.length > 0 ? `Approved (${parts.join(', ')})` : 'Approved';
  }

  private timelineToDays(timeline: string): number | null {
    const match = timeline.match(
      /(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years)/i,
    );
    if (!match) return null;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const days = unit.startsWith('week')
      ? value * 7
      : unit.startsWith('month')
        ? value * 30
        : unit.startsWith('year')
          ? value * 365
          : value;
    return Math.round(days);
  }

  private formatBudgetAmount(amount: number, currency?: string): string {
    const symbol = CURRENCY_SYMBOLS[currency?.toUpperCase() ?? ''];
    return symbol ? `${symbol}${amount}` : `${amount} ${currency ?? ''}`.trim();
  }

  private async answer(
    botToken: string,
    callbackQueryId: string,
    text: string,
  ) {
    try {
      await this.telegramProvider.answerCallback(
        botToken,
        callbackQueryId,
        text,
      );
    } catch (error) {
      this.logger.warn(
        `answerCallbackQuery failed: ${(error as Error).message}`,
      );
    }
  }

  private async resolveBotToken(jobId?: string): Promise<string | undefined> {
    if (jobId) {
      const job = await this.prisma.job
        .findUnique({ where: { id: jobId } })
        .catch(() => null);
      if (job) {
        const user = await this.prisma.user
          .findUnique({ where: { id: job.userId } })
          .catch(() => null);
        if (user?.encryptedTelegramBotToken) {
          try {
            return this.crypto.decrypt(user.encryptedTelegramBotToken);
          } catch {
            this.logger.warn('Failed to decrypt Telegram bot token');
          }
        }
      }
    }
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN');
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  BDT: '৳',
  AUD: 'A$',
  CAD: 'C$',
};
