import { Injectable } from '@nestjs/common';
import { ProviderRouter } from './provider-router.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import {
  JobAnalysisInput,
  JobAnalysisOutput,
  ProviderCredentials,
} from '../common/interfaces/job.interface';

interface AiContext {
  providerName: string;
  credentials: ProviderCredentials;
}

@Injectable()
export class AiService {
  constructor(
    private providerRouter: ProviderRouter,
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async analyze(
    input: JobAnalysisInput,
    userId: string,
  ): Promise<JobAnalysisOutput> {
    const ctx = await this.buildContext(userId);
    return this.providerRouter
      .getProvider(ctx.providerName)
      .analyze(input, ctx.credentials);
  }

  async getProviderMeta(userId: string): Promise<{
    provider: string;
    model: string | null;
  }> {
    const ctx = await this.buildContext(userId);
    const provider = this.providerRouter.getProvider(ctx.providerName);
    return {
      provider: provider.name,
      model: provider.model,
    };
  }

  private async buildContext(userId: string): Promise<AiContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const providerName = user?.aiProvider || 'ollama';

    let apiKey: string | undefined;
    if (user?.encryptedAiApiKey) {
      try {
        apiKey = this.crypto.decrypt(user.encryptedAiApiKey);
      } catch {
        apiKey = undefined;
      }
    }

    return { providerName, credentials: { apiKey } };
  }
}
