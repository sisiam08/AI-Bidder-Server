import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from '../common/dto/create-job.dto';
import { JobPipelineService } from '../pipeline/job-pipeline.service';
import { JobsGateway } from '../websocket/jobs.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { JobStatus } from '../common/enums/job-status.enum';
import { BlockedBidNotification } from '../common/interfaces/job.interface';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private pipeline: JobPipelineService,
    private jobsGateway: JobsGateway,
    private notificationsService: NotificationsService,
  ) {}

  computeFingerprint(platform: string, externalJobId: string): string {
    return createHash('sha256')
      .update(`${platform}:${externalJobId}`)
      .digest('hex');
  }

  async createJob(userId: string, dto: CreateJobDto) {
    const fingerprint = this.computeFingerprint(
      dto.platform,
      dto.externalJobId,
    );

    const existing = await this.prisma.job.findUnique({
      where: { fingerprint },
    });
    if (existing) {
      return null;
    }

    try {
      const job = await this.prisma.job.create({
        data: {
          userId,
          platform: dto.platform,
          externalJobId: dto.externalJobId,
          fingerprint,
          title: dto.title,
          description: dto.description,
          budget: dto.budget as any,
          skills: dto.skills,
          clientInfo: dto.clientInfo as any,
          status: JobStatus.Processing,
          postedAt: new Date(dto.postedAt),
        },
      });

      await this.recordStatusHistory(
        job.id,
        null,
        JobStatus.Processing,
        'system',
      );

      void this.pipeline.process(job.id);

      return job;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async getJob(jobId: string, userId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
      include: { aiAnalysis: true, proposals: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async listJobs(userId: string, status?: string) {
    const where: any = { userId };
    if (status) {
      where.status = status as JobStatus;
    }
    return this.prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { aiAnalysis: true },
    });
  }

  async getProposal(jobId: string, userId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
      include: { aiAnalysis: true, proposals: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return {
      job,
      analysis: job.aiAnalysis,
      proposal: job.proposals[0] || null,
    };
  }

  async submit(jobId: string, userId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.ReadyToFill) {
      throw new BadRequestException(
        `Cannot submit from ${job.status}; job must be ReadyToFill`,
      );
    }

    const submittedAt = new Date();
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.Completed,
        isSubmitted: true,
        submittedAt,
      },
    });
    await this.recordStatusHistory(
      jobId,
      JobStatus.ReadyToFill,
      JobStatus.Completed,
      'user',
    );

    await this.prisma.proposal
      .updateMany({
        where: { jobId },
        data: { status: 'Submitted' },
      })
      .catch(() => undefined);

    this.jobsGateway.emitJobEvent(userId, 'job.submitted', {
      jobId,
      submittedAt: submittedAt.toISOString(),
    });

    return { jobId, status: JobStatus.Completed };
  }

  /** Records that the extension has filled the proposal fields on the platform. */
  async markProposalFilled(jobId: string, userId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { jobId },
    });
    if (proposal) {
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'Filled' },
      });
    }

    return { jobId, status: job.status };
  }

  async notifyBidBlocked(jobId: string, userId: string, reasons: string[]) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const payload: BlockedBidNotification = {
      jobId,
      platform: job.platform,
      title: job.title,
      jobUrl: this.buildJobUrl(job.platform, job.externalJobId),
      reasons,
    };

    const receipt = await this.notificationsService.sendBidBlocked(
      userId,
      payload,
    );
    if (!receipt.success) {
      this.logger.warn(
        `Bid-blocked notification for job ${jobId} failed: ${receipt.error}`,
      );
    }

    return { jobId, delivered: receipt.success };
  }

  private buildJobUrl(platform: string, externalJobId: string): string {
    switch (platform) {
      case 'upwork': {
        const id = externalJobId.match(/~([a-f0-9]+)/)?.[1] ?? externalJobId;
        return `https://www.upwork.com/jobs/${id}`;
      }
      case 'freelancer': {
        const clean = externalJobId.split('?')[0].split('#')[0].replace(/\/+$/, '');
        const m = clean.match(/^\/projects\/(.+)$/);
        const slug = (m ? m[1] : clean).replace(/^\/+/, '').replace(/\/(details|bid)$/i, '');
        return `https://www.freelancer.com/projects/${slug}/details`;
      }
      default:
        return '';
    }
  }

  private async recordStatusHistory(
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
