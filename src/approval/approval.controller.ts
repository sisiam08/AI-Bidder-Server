import { Controller, Post, Param, UseGuards, Req, HttpCode } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ApprovalService } from './approval.service';

interface ApprovalRequest {
  user?: { userId: string };
}

@Controller('v1/jobs')
@UseGuards(AuthGuard)
export class ApprovalController {
  constructor(private approvalService: ApprovalService) {}

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Req() req: ApprovalRequest, @Param('id') id: string) {
    return this.approvalService.approve(id, `user:${req.user?.userId}`);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Req() req: ApprovalRequest, @Param('id') id: string) {
    return this.approvalService.reject(id, `user:${req.user?.userId}`);
  }
}
