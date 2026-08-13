import {
  JobNotification,
  DeliveryReceipt,
  ApprovalCallback,
} from '../../common/interfaces/job.interface';

export interface NotificationCredentials {
  botToken?: string;
  chatId?: string;
}

export interface NotificationProvider {
  name: 'telegram';
  send(
    payload: JobNotification,
    credentials: NotificationCredentials,
  ): Promise<DeliveryReceipt>;
  parseCallback(raw: unknown): ApprovalCallback;
}
