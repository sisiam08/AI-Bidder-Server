import { Injectable } from '@nestjs/common';
import { AiProvider } from '../interfaces/ai-provider.interface';
import {
  JobAnalysisInput,
  JobAnalysisOutput,
  ProviderCredentials,
} from '../../common/interfaces/job.interface';
import {
  buildAnalysisPrompt,
  parseAnalysisResponse,
} from '../common';

@Injectable()
export class OpenRouterProvider implements AiProvider {
  name = 'openrouter' as const;

  readonly model = 'openai/gpt-4o-mini';

  async analyze(
    input: JobAnalysisInput,
    credentials: ProviderCredentials,
  ): Promise<JobAnalysisOutput> {
    const raw = await this.chat(buildAnalysisPrompt(input), credentials);
    return parseAnalysisResponse(raw);
  }

  private async chat(
    prompt: string,
    credentials: ProviderCredentials,
  ): Promise<string> {
    const apiKey = credentials.apiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const raw = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return raw.choices?.[0]?.message?.content ?? '';
  }
}
