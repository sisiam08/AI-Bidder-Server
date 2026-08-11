import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto } from '../common/dto/create-job.dto';
import { BidBlockedDto } from '../common/dto/bid-blocked.dto';

@Controller('v1/jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateJobDto) {
    const job = await this.jobsService.createJob(req.user.userId, dto);
    if (!job) {
      return;
    }
    return job;
  }

  @Get()
  async list(@Req() req: any, @Query('status') status?: string) {
    return this.jobsService.listJobs(req.user.userId, status);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.jobsService.getJob(id, req.user.userId);
  }

  @Get(':id/proposal')
  async getProposal(@Req() req: any, @Param('id') id: string) {
    return this.jobsService.getProposal(id, req.user.userId);
  }

  @Post(':id/submit')
  @HttpCode(200)
  async submit(@Req() req: any, @Param('id') id: string) {
    return this.jobsService.submit(id, req.user.userId);
  }

  @Post(':id/proposal/fill')
  @HttpCode(200)
  async markProposalFilled(@Req() req: any, @Param('id') id: string) {
    return this.jobsService.markProposalFilled(id, req.user.userId);
  }

  @Post(':id/bid-blocked')
  @HttpCode(200)
  async notifyBidBlocked(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: BidBlockedDto,
  ) {
    return this.jobsService.notifyBidBlocked(id, req.user.userId, dto.reasons);
  }
}
