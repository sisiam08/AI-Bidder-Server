import {
  JobAnalysisInput,
  JobAnalysisOutput,
  ProviderCredentials,
} from '../../common/interfaces/job.interface';

export interface AiProvider {
  name: 'ollama' | 'openrouter' | 'openai' | 'gemini' | 'claude';
  model: string;
  analyze(
    input: JobAnalysisInput,
    credentials: ProviderCredentials,
  ): Promise<JobAnalysisOutput>;
}
