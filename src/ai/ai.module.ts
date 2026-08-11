import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { ProviderRouter } from './provider-router.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [
    AiService,
    OllamaProvider,
    OpenRouterProvider,
    ProviderRouter,
    PrismaService,
  ],
  exports: [AiService],
})
export class AiModule {}
