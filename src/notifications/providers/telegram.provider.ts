import { Injectable } from '@nestjs/common';
import {
  NotificationProvider,
  NotificationCredentials,
} from '../interfaces/notification-provider.interface';
import {
  JobNotification,
  DeliveryReceipt,
  ApprovalCallback,
  BlockedBidNotification,
} from '../../common/interfaces/job.interface';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  BDT: '৳',
  AUD: 'A$',
  CAD: 'C$',
};

@Injectable()
export class TelegramProvider implements NotificationProvider {
  name = 'telegram' as const;

  async send(
    payload: JobNotification,
    credentials: NotificationCredentials,
  ): Promise<DeliveryReceipt> {
    if (!credentials.botToken || !credentials.chatId) {
      return {
        success: false,
        error: 'Telegram not configured for user',
        isConfigurationError: true,
      };
    }

    const message = this.buildMessage(payload);

    const response = await fetch(
      `https://api.telegram.org/bot${credentials.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: credentials.chatId,
          text: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: this.buildProposalKeyboard(payload),
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = (await response.json()) as {
      result?: { message_id?: number };
    };
    return {
      success: true,
      messageId: String(result.result?.message_id ?? ''),
    };
  }

  parseCallback(raw: unknown): ApprovalCallback {
    const data = (raw as { callback_query?: { data?: string } })?.callback_query
      ?.data;
    const [action, jobId] = (data || '').split(':');
    return {
      jobId,
      action: action === 'approve' ? 'approve' : 'reject',
      channel: 'telegram',
    };
  }

  buildStatusKeyboard(
    original: object[][],
    outcome: 'approve' | 'reject',
    jobId: string,
    label?: string,
  ): object[][] {
    const rows: object[][] = [];
    for (const row of original) {
      const urlButtons = row.filter((b) => (b as { url?: string }).url);
      if (urlButtons.length > 0) rows.push(urlButtons);
    }
    rows.push([
      {
        text: label ?? (outcome === 'approve' ? 'Approved' : 'Rejected'),
        callback_data: `noop:${jobId}`,
      },
    ]);
    return rows;
  }

  async editMessageReplyMarkup(
    botToken: string,
    chatId: string | number,
    messageId: number,
    inlineKeyboard: object[][],
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`editMessageReplyMarkup failed: ${error}`);
    }
  }

  async answerCallback(
    botToken: string,
    callbackQueryId: string,
    text: string,
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`answerCallbackQuery failed: ${error}`);
    }
  }

  async sendBlocked(
    payload: BlockedBidNotification,
    credentials: NotificationCredentials,
  ): Promise<DeliveryReceipt> {
    if (!credentials.botToken || !credentials.chatId) {
      return {
        success: false,
        error: 'Telegram not configured for user',
        isConfigurationError: true,
      };
    }

    const message = [
      `🚫 Bid Blocked — ${this.escapeHtml(payload.platform)}`,
      `Title: <b>${this.escapeHtml(payload.title)}</b>`,
      '',
      '<b>Restrictions:</b>',
      ...payload.reasons.map(
        (reason) => `• ${this.escapeHtml(reason)}`,
      ),
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const response = await fetch(
      `https://api.telegram.org/bot${credentials.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: credentials.chatId,
          text: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: payload.jobUrl
              ? [[{ text: 'View Job', url: payload.jobUrl }] as object]
              : [],
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = (await response.json()) as {
      result?: { message_id?: number };
    };
    return {
      success: true,
      messageId: String(result.result?.message_id ?? ''),
    };
  }

  buildProposalKeyboard(payload: {
    jobId: string;
    jobUrl: string;
    suggestedBudget?: { amount: number; currency: string };
    suggestedTimeline?: string;
  }): object[][] {
    const rows: object[][] = [
      [
        {
          text: 'Edit Budget',
          callback_data: `edit:budget:${payload.jobId}`,
        },
        { text: 'Edit Days', callback_data: `edit:days:${payload.jobId}` },
      ],
    ];
    if (payload.jobUrl) {
      rows.push([{ text: 'View Job', url: payload.jobUrl }]);
    }
    rows.push([
      { text: 'Approve', callback_data: `approve:${payload.jobId}` },
      { text: 'Reject', callback_data: `reject:${payload.jobId}` },
    ]);
    return rows;
  }


  buildBudgetEditKeyboard(payload: {
    jobId: string;
    jobUrl: string;
    suggestedBudget?: { amount: number; currency: string };
  }): object[][] {
    const amount = payload.suggestedBudget?.amount ?? 0;
    const currency = payload.suggestedBudget?.currency ?? 'USD';
    const symbol =
      CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
    const step = 50;
    const label = (n: number) => `${symbol}${n}`;

    const rows: object[][] = [
      [
        {
          text: `-${label(step)}`,
          callback_data: `step:budget:dec:${payload.jobId}`,
        },
        {
          text: `Budget: ${label(amount)}`,
          callback_data: `label:budget:${payload.jobId}`,
        },
        {
          text: `+${label(step)}`,
          callback_data: `step:budget:inc:${payload.jobId}`,
        },
      ],
      [{ text: 'Done', callback_data: `done:budget:${payload.jobId}` }],
    ];
    if (payload.jobUrl) {
      rows.push([{ text: 'View Job', url: payload.jobUrl }]);
    }
    return rows;
  }

  buildDaysEditKeyboard(payload: {
    jobId: string;
    jobUrl: string;
    suggestedTimeline?: string;
  }): object[][] {
    const days = payload.suggestedTimeline
      ? (this.timelineToDays(payload.suggestedTimeline) ?? 0)
      : 0;
    const step = 5;

    const rows: object[][] = [
      [
        {
          text: `-${step} Days`,
          callback_data: `step:days:dec:${payload.jobId}`,
        },
        { text: `Days: ${days}`, callback_data: `label:days:${payload.jobId}` },
        {
          text: `+${step} Days`,
          callback_data: `step:days:inc:${payload.jobId}`,
        },
      ],
      [{ text: 'Done', callback_data: `done:days:${payload.jobId}` }],
    ];
    if (payload.jobUrl) {
      rows.push([{ text: 'View Job', url: payload.jobUrl }]);
    }
    return rows;
  }

  async editMessageText(
    botToken: string,
    chatId: string | number,
    messageId: number,
    text: string,
    inlineKeyboard?: object[][],
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`editMessageText failed: ${error}`);
    }
  }

  async sendText(
    botToken: string,
    chatId: string | number,
    text: string,
  ): Promise<number | null> {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    if (!response.ok) return null;
    const result = (await response.json()) as {
      result?: { message_id?: number };
    };
    return result.result?.message_id ?? null;
  }

  async deleteMessage(
    botToken: string,
    chatId: string | number,
    messageId: number,
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`deleteMessage failed: ${error}`);
    }
  }

  buildMessage(payload: JobNotification): string {
    const proposedBudget = payload.suggestedBudget
      ? this.formatAmount(
          payload.suggestedBudget.amount,
          payload.suggestedBudget.currency,
        )
      : null;
    const proposedDays = payload.suggestedTimeline
      ? this.timelineToDaysLabel(payload.suggestedTimeline)
      : null;

    return [
      `🔔 New Job Match — ${payload.platform}`,
      `Title: ${payload.title}`,
      proposedBudget ? `Proposed Budget: ${proposedBudget}` : null,
      proposedDays ? `Proposed Days: ${proposedDays}` : null,
      '',
      ...this.formatBudget(payload.budget),
      '',
      'Summary:',
      payload.aiSummary,
      '',
      `Required Skills: ${payload.skills.join(', ')}`,
      '',
      'Suggested Proposal:',
      payload.suggestedProposal,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  private formatAmount(amount: number, currency?: string): string {
    const symbol = CURRENCY_SYMBOLS[currency?.toUpperCase() ?? ''];
    return symbol ? `${symbol}${amount}` : `${amount} ${currency ?? ''}`.trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private timelineToDays(timeline: string): number | null {
    const match = timeline.match(
      /(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years)/i,
    );
    if (!match) return null;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const days = unit.startsWith('week')
      ? value * 7
      : unit.startsWith('month')
        ? value * 30
        : unit.startsWith('year')
          ? value * 365
          : value;
    return Math.round(days);
  }

  private timelineToDaysLabel(timeline: string): string | null {
    const days = this.timelineToDays(timeline);
    if (days === null) return null;
    return `${days} Day${days === 1 ? '' : 's'}`;
  }

  private formatBudget(budget: JobNotification['budget']): (string | null)[] {
    const min = budget?.min;
    const max = budget?.max;
    let range: string;
    if (min !== undefined && max !== undefined) {
      range = `${min}-${max}`;
    } else if (min !== undefined) {
      range = String(min);
    } else if (max !== undefined) {
      range = String(max);
    } else {
      range = '';
    }

    const type =
      budget?.type === 'fixed'
        ? 'Fixed'
        : budget?.type === 'hourly'
          ? 'Hourly'
          : budget?.type
            ? String(budget.type)
            : '';

    return [
      range ? `Budget: ${range}` : null,
      type ? `Type: ${type}` : null,
      budget?.currency ? `Currency: ${budget.currency}` : null,
    ];
  }
}
