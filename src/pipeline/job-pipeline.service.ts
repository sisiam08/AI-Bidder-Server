import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobsGateway } from '../websocket/jobs.gateway';
import { JobStatus } from '../common/enums/job-status.enum';
import {
  JobAnalysisInput,
  JobNotification,
} from '../common/interfaces/job.interface';
import { buildJobUrl } from '../common/job-url';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [10_000, 30_000];
const TELEGRAM_CHANNEL = 'TELEGRAM' as const;

@Injectable()
export class JobPipelineService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(JobPipelineService.name);
  private readonly inFlight = new Set<string>();
  private shuttingDown = false;

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private notificationsService: NotificationsService,
    private jobsGateway: JobsGateway,
  ) {}

  async onApplicationBootstrap() {
    await this.resumeInterruptedJobs().catch((error) => {
      this.logger.warn(
        `Failed to resume interrupted jobs: ${(error as Error).message}`,
      );
    });
  }

  onModuleDestroy() {
    this.shuttingDown = true;
  }

  async resumeInterruptedJobs(): Promise<number> {
    const interrupted = await this.prisma.job.findMany({
      where: { status: { in: [JobStatus.Processing, JobStatus.Failed] } },
    });

    for (const job of interrupted) {
      await this.process(job.id);
    }

    if (interrupted.length > 0) {
      this.logger.log(`Resumed ${interrupted.length} interrupted job(s)`);
    }
    return interrupted.length;
  }

  async process(jobId: string): Promise<void> {
    if (this.inFlight.has(jobId) || this.shuttingDown) {
      return;
    }
    this.inFlight.add(jobId);

    try {
      let attempt = 0;
      for (;;) {
        try {
          await this.runStage(jobId);
          return;
        } catch (error) {
          attempt += 1;
          this.logger.warn(
            `Pipeline attempt ${attempt}/${MAX_ATTEMPTS} failed for job ${jobId}: ${
              (error as Error).message
            }`,
          );
          if (attempt >= MAX_ATTEMPTS) {
            throw error;
          }
          await this.delay(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[0]);
          if (this.shuttingDown) return;
        }
      }
    } catch (error) {
      await this.markFailed(jobId, error as Error);
    } finally {
      this.inFlight.delete(jobId);
    }
  }

  private async runStage(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job) return;

    const status = job.status as JobStatus;
    if (status !== JobStatus.Processing && status !== JobStatus.Failed) {
      return;
    }

    const input: JobAnalysisInput = {
      title: job.title,
      description: job.description,
      budget: job.budget as JobAnalysisInput['budget'],
      skills: job.skills,
      clientInfo: job.clientInfo as JobAnalysisInput['clientInfo'],
    };

    if (!job.aiAnalysis) {
      const full = await this.aiService.analyze(input, job.userId);
      const providerMeta = await this.aiService.getProviderMeta(job.userId);

      await this.prisma.aiAnalysis.create({
        data: {
          jobId,
          summary: full.summary,
          requiredSkills: full.requiredSkills,
          suggestedProposal: full.suggestedProposal,
          suggestedBudget: full.suggestedBudget,
          suggestedTimeline: full.suggestedTimeline ?? null,
          questions: full.questions ?? undefined,
          portfolioLink: full.portfolioLink ?? null,
          providerUsed: providerMeta.provider,
          model: providerMeta.model,
        },
      });
    }

    await this.notify(jobId);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.WaitingApproval },
    });
    await this.recordHistory(
      jobId,
      job.status,
      JobStatus.WaitingApproval,
      'system',
    );

    this.jobsGateway.emitJobEvent(job.userId, 'job.analyzed', {
      jobId,
    });
  }

  private async notify(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job || !job.aiAnalysis) return;

    const existing = await this.prisma.notification.findFirst({
      where: { jobId, channel: TELEGRAM_CHANNEL },
    });
    if (existing?.status === 'Sent') {
      return;
    }

    const record = existing
      ? await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            status: 'Pending',
            retryCount: { increment: 1 },
            messageId: null,
            error: null,
          },
        })
      : await this.prisma.notification.create({
          data: {
            jobId,
            channel: TELEGRAM_CHANNEL,
            status: 'Pending',
            retryCount: 0,
          },
        });

    const payload: JobNotification = {
      jobId,
      platform: job.platform,
      title: job.title,
      jobUrl: buildJobUrl(job.platform, job.externalJobId),
      budget: job.budget as JobNotification['budget'],
      clientTimeline: this.clientTimeline(job.clientInfo),
      aiSummary: job.aiAnalysis.summary,
      skills: job.skills,
      suggestedProposal: job.aiAnalysis.suggestedProposal,
      suggestedBudget: job.aiAnalysis.suggestedBudget as
        { amount: number; currency: string } | undefined,
      suggestedTimeline: job.aiAnalysis.suggestedTimeline ?? undefined,
    };

    const receipt = await this.notificationsService.send(job.userId, payload);

    if (!receipt.success) {
      await this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'Failed', error: receipt.error ?? 'Unknown error' },
      });
      if (receipt.isConfigurationError) {
        this.logger.warn(
          `Job ${jobId} notification skipped (${receipt.error}). Job proceeds to WaitingApproval.`,
        );
        return;
      }
      throw new Error(`Notification delivery failed: ${receipt.error}`);
    }

    await this.prisma.notification.update({
      where: { id: record.id },
      data: {
        status: 'Sent',
        messageId: receipt.messageId,
        sentAt: new Date(),
        error: null,
      },
    });
  }

  private async markFailed(jobId: string, error: Error) {
    const job = await this.prisma.job
      .findUnique({ where: { id: jobId } })
      .catch(() => null);
    if (!job) return;

    await this.prisma.job
      .update({
        where: { id: jobId },
        data: { status: JobStatus.Failed },
      })
      .catch(() => undefined);
    await this.recordHistory(
      jobId,
      job.status,
      JobStatus.Failed,
      'system',
    ).catch(() => undefined);

    this.logger.error(`Job ${jobId} failed permanently: ${error.message}`);
    this.jobsGateway.emitJobEvent(job.userId, 'job.failed', {
      jobId,
      error: error.message,
    });
  }

  private async recordHistory(
    jobId: string,
    fromStatus: string | null,
    toStatus: string,
    actor: string,
  ) {
    await this.prisma.jobStatusHistory.create({
      data: {
        jobId,
        fromStatus: fromStatus || '',
        toStatus,
        actor,
      },
    });
  }

  private clientTimeline(clientInfo: unknown): string | undefined {
    if (!clientInfo || typeof clientInfo !== 'object') return undefined;
    const timeline = (clientInfo as Record<string, unknown>).timeline;
    return typeof timeline === 'string' && timeline.trim()
      ? timeline.trim()
      : undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
