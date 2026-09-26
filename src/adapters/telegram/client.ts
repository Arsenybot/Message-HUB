/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
}

export class TelegramApiClient {
  private readonly baseUrl: string;

  constructor(private readonly token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  public hasToken(): boolean {
    return Boolean(this.token && this.token.trim().length > 10);
  }

  private async callApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.hasToken()) {
      throw new Error(`Telegram token not configured for this bot.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const errorDesc = data.description || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`Telegram API [${method}] failed: ${errorDesc}`);
      }

      return data.result as T;
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') {
        throw new Error(`Telegram API [${method}] timed out after 8s`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async getMe(): Promise<TelegramUser> {
    return this.callApi<TelegramUser>('getMe');
  }

  public async sendMessage(
    chatId: number | string,
    text: string,
    options?: { parse_mode?: 'Markdown' | 'HTML'; reply_to_message_id?: number }
  ): Promise<TelegramMessage> {
    return this.callApi<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode,
      reply_to_message_id: options?.reply_to_message_id,
    });
  }

  public async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    return this.callApi<boolean>('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
  }

  public async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.callApi<TelegramWebhookInfo>('getWebhookInfo');
  }

  public async deleteWebhook(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/deleteWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: false }),
      });
      const data = await response.json();
      return Boolean(data.ok);
    } catch {
      return false;
    }
  }

  public async getUpdates(options?: {
    offset?: number;
    limit?: number;
    timeout?: number;
  }): Promise<TelegramUpdate[]> {
    const timeoutSec = options?.timeout ?? 10;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), (timeoutSec + 5) * 1000);

    try {
      const response = await fetch(`${this.baseUrl}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: options?.offset,
          limit: options?.limit ?? 50,
          timeout: timeoutSec,
          allowed_updates: ['message', 'edited_message'],
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(`Telegram API [getUpdates] failed: ${data.description || response.statusText}`);
      }
      return (data.result as TelegramUpdate[]) || [];
    } catch (err: unknown) {
      const isAbort =
        (err as { name?: string })?.name === 'AbortError' ||
        (err as { cause?: { name?: string } })?.cause?.name === 'AbortError' ||
        String(err).includes('aborted');
      if (isAbort) {
        return [];
      }
      throw err;
    } finally {
      clearTimeout(abortTimer);
    }
  }
}
