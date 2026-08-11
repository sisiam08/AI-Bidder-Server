import { IsObject } from 'class-validator';

export class TelegramWebhookDto {
  @IsObject()
  callback_query!: {
    id: string;
    data: string;
    message: any;
    from: any;
  };
}
