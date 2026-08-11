import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const AI_PROVIDERS = ['ollama', 'openrouter', 'openai', 'gemini', 'claude'];

export class SetupUserDto {
  @IsEmail()
  email!: string;

  @IsIn(AI_PROVIDERS)
  aiProvider!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  aiApiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;
}
