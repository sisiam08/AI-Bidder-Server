import { Injectable } from '@nestjs/common';
import { AiProvider } from './interfaces/ai-provider.interface';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Injectable()
export class ProviderRouter {
  constructor(
    private ollamaProvider: OllamaProvider,
    private openRouterProvider: OpenRouterProvider,
  ) {}

  getProvider(name?: string): AiProvider {
    switch (name || 'ollama') {
      case 'openrouter':
        return this.openRouterProvider;
      case 'ollama':
        return this.ollamaProvider;
      default:
        throw new Error(`AI provider '${name}' is not implemented yet`);
    }
  }
}
