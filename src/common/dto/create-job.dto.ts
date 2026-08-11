import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class BudgetDto {
  @IsOptional()
  @IsIn(['fixed', 'hourly'])
  type?: 'fixed' | 'hourly';

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

class ClientInfoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  rating?: number;

  @IsOptional()
  @IsNumber()
  totalSpent?: number;

  @IsOptional()
  @IsNumber()
  bids?: number;

  @IsOptional()
  @IsBoolean()
  paymentVerified?: boolean;

  @IsOptional()
  @IsNumber()
  spent?: number;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  proposals?: string;
}

export class CreateJobDto {
  @IsString()
  @IsIn(['upwork', 'freelancer', 'guru', 'peopleperhour'])
  platform!: string;

  @IsString()
  externalJobId!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @ValidateNested()
  @Type(() => BudgetDto)
  budget!: BudgetDto;

  @IsArray()
  @IsString({ each: true })
  skills!: string[];

  @ValidateNested()
  @Type(() => ClientInfoDto)
  clientInfo!: ClientInfoDto;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  experienceLevel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsString()
  postedAt!: string;
}
