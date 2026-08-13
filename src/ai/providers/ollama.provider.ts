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
export class OllamaProvider implements AiProvider {
  name = 'ollama' as const;

  readonly endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
  readonly model = process.env.OLLAMA_MODEL || 'llama3';

  async analyze(
    input: JobAnalysisInput,
    _credentials: ProviderCredentials,
  ): Promise<JobAnalysisOutput> {
    const raw = await this.generate(
      this.buildPrompt(buildAnalysisPrompt(input)),
    );
    return parseAnalysisResponse(raw);
  }

  private buildPrompt(prompt: string): string {
    return prompt;
  }

  private async generate(prompt: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `AI provider (Ollama) is unreachable at ${this.endpoint} (${detail}). Install and start Ollama, then make sure the model "${this.model}" is pulled.`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `AI provider (Ollama) error ${response.status}: ${response.statusText}${
          body ? ` — ${body.slice(0, 300)}` : ''
        }`,
      );
    }

    const raw = (await response.json()) as { response?: string };
    return raw.response ?? '';
  }
}
