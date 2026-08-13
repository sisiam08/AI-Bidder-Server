import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '../common/enums/job-status.enum';
import { JobsGateway } from '../websocket/jobs.gateway';

@Injectable()
export class ApprovalService {
  constructor(
    private prisma: PrismaService,
    private jobsGateway: JobsGateway,
  ) {}

  private readonly validTransitions: Record<JobStatus, JobStatus[]> = {
    [JobStatus.Processing]: [],
    [JobStatus.WaitingApproval]: [JobStatus.Approved, JobStatus.Rejected],
    [JobStatus.Approved]: [JobStatus.ReadyToFill],
    [JobStatus.ReadyToFill]: [JobStatus.Completed, JobStatus.Rejected],
    [JobStatus.Completed]: [],
    [JobStatus.Rejected]: [],
    [JobStatus.Failed]: [],
  };

  async approve(jobId: string, actor: string = 'user') {
    return this.transition(jobId, JobStatus.Approved, actor);
  }

  async reject(jobId: string, actor: string = 'user') {
    return this.transition(jobId, JobStatus.Rejected, actor);
  }

  private async transition(jobId: string, toStatus: JobStatus, actor: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const currentStatus = job.status as JobStatus;
    const allowed = this.validTransitions[currentStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${toStatus}`,
      );
    }

    await this.updateStatus(jobId, currentStatus, toStatus, actor);

    if (toStatus === JobStatus.Approved) {
      await this.upsertProposal(jobId, job.aiAnalysis?.suggestedProposal ?? '');
      await this.updateStatus(
        jobId,
        JobStatus.Approved,
        JobStatus.ReadyToFill,
        'system',
      );
      await this.emitApproved(jobId);
    } else if (toStatus === JobStatus.Rejected) {
      this.jobsGateway.emitJobEvent(job.userId, 'job.rejected', { jobId });
    }

    return { jobId, status: toStatus };
  }

  private async updateStatus(
    jobId: string,
    fromStatus: JobStatus,
    toStatus: JobStatus,
    actor: string,
  ) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: toStatus },
    });
    await this.prisma.jobStatusHistory.create({
      data: { jobId, fromStatus, toStatus, actor },
    });
  }

  private async upsertProposal(jobId: string, content: string) {
    const existing = await this.prisma.proposal.findUnique({ where: { jobId } });
    if (existing) {
      await this.prisma.proposal.update({
        where: { id: existing.id },
        data: { content, status: 'Approved' },
      });
      return;
    }
    await this.prisma.proposal.create({
      data: { jobId, content, status: 'Approved' },
    });
  }

  private async emitApproved(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { aiAnalysis: true },
    });
    if (!job) return;

    this.jobsGateway.emitJobEvent(job.userId, 'job.approved', {
      jobId,
      platform: job.platform,
      externalJobId: job.externalJobId,
      proposalText: job.aiAnalysis?.suggestedProposal ?? '',
      budget: job.aiAnalysis?.suggestedBudget ?? {},
      clientBudget: job.budget,
      clientTimeline: this.clientTimeline(job.clientInfo),
      timeline: job.aiAnalysis?.suggestedTimeline ?? undefined,
    });
  }

  private clientTimeline(clientInfo: unknown): string | undefined {
    if (!clientInfo || typeof clientInfo !== 'object') return undefined;
    const timeline = (clientInfo as Record<string, unknown>).timeline;
    return typeof timeline === 'string' && timeline.trim()
      ? timeline.trim()
      : undefined;
  }
}
