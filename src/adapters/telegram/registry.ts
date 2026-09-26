/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelegramApiClient, TelegramWebhookInfo } from './client.js';
import { BotStatusInfo } from '../../types/index.js';

class TelegramBotRegistry {
  private botAClients: TelegramApiClient | null = null;
  private botBClients: TelegramApiClient | null = null;

  public init() {
    const tokenA = process.env.TELEGRAM_BOT_A_TOKEN || '';
    const tokenB = process.env.TELEGRAM_BOT_B_TOKEN || '';

    this.botAClients = new TelegramApiClient(tokenA);
    this.botBClients = new TelegramApiClient(tokenB);
  }

  public getClient(botId: 'bot_a' | 'bot_b' | string): TelegramApiClient | null {
    if (botId === 'bot_b') {
      return this.botBClients;
    }
    return this.botAClients;
  }

  public setToken(botId: 'bot_a' | 'bot_b', token: string) {
    if (botId === 'bot_b') {
      process.env.TELEGRAM_BOT_B_TOKEN = token;
      this.botBClients = new TelegramApiClient(token);
    } else {
      process.env.TELEGRAM_BOT_A_TOKEN = token;
      this.botAClients = new TelegramApiClient(token);
    }
  }

  public async getBotStatus(botId: 'bot_a' | 'bot_b'): Promise<BotStatusInfo> {
    const client = this.getClient(botId);
    if (!client || !client.hasToken()) {
      return {
        bot_id: botId,
        configured: false,
        error: `Bot token for ${botId.toUpperCase()} is not set in environment secrets.`,
      };
    }

    try {
      const me = await client.getMe();
      let webhookInfo: TelegramWebhookInfo | undefined;
      try {
        webhookInfo = await client.getWebhookInfo();
      } catch {
        // webhook check might fail if network restricted, continue
      }

      return {
        bot_id: botId,
        configured: true,
        username: me.username,
        name: me.first_name,
        can_join_groups: true,
        webhook: webhookInfo
          ? {
              url: webhookInfo.url,
              has_custom_certificate: webhookInfo.has_custom_certificate,
              pending_update_count: webhookInfo.pending_update_count,
              last_error_date: webhookInfo.last_error_date,
              last_error_message: webhookInfo.last_error_message,
              max_connections: webhookInfo.max_connections,
              ip_address: webhookInfo.ip_address,
            }
          : undefined,
      };
    } catch (err: unknown) {
      return {
        bot_id: botId,
        configured: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async setupWebhook(
    botId: 'bot_a' | 'bot_b',
    appUrl: string,
    secretToken?: string
  ): Promise<{ success: boolean; url: string; error?: string }> {
    const client = this.getClient(botId);
    if (!client || !client.hasToken()) {
      return {
        success: false,
        url: '',
        error: `Bot token for ${botId.toUpperCase()} is not configured.`,
      };
    }

    const cleanAppUrl = appUrl.replace(/\/+$/, '');
    const webhookUrl = `${cleanAppUrl}/api/integrations/telegram/webhook/${botId}`;

    try {
      const result = await client.setWebhook(webhookUrl, secretToken);
      return {
        success: result,
        url: webhookUrl,
      };
    } catch (err: unknown) {
      return {
        success: false,
        url: webhookUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const telegramRegistry = new TelegramBotRegistry();
telegramRegistry.init();
