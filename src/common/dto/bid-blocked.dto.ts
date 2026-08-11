import { IsArray, IsString } from 'class-validator';

export class BidBlockedDto {
  @IsArray()
  @IsString({ each: true })
  reasons!: string[];
}
