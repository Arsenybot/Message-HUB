/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { telegramRegistry } from './registry.js';
import { telegramAdapter } from './adapter.js';
import { TelegramUpdate } from './client.js';

export class TelegramPoller {
  private isRunning = false;
  private botOffsets: Record<'bot_a' | 'bot_b', number> = {
    bot_a: 0,
    bot_b: 0,
  };

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Telegram Poller] Starting long polling service for Bot A and Bot B...');

    this.pollBot('bot_a');
    this.pollBot('bot_b');
  }

  public stop() {
    this.isRunning = false;
    console.log('[Telegram Poller] Polling stopped.');
  }

  private async pollBot(botId: 'bot_a' | 'bot_b') {
    const client = telegramRegistry.getClient(botId);
    if (!client || !client.hasToken()) {
      console.log(`[Telegram Poller] Bot [${botId}] has no token configured. Polling skipped.`);
      return;
    }

    // Unset any webhook so Telegram allows getUpdates without 409 Conflict
    try {
      await client.deleteWebhook();
      console.log(`[Telegram Poller] Webhook cleared for ${botId.toUpperCase()}, long polling active.`);
    } catch (err) {
      console.warn(`[Telegram Poller] Could not clear webhook for ${botId}:`, err);
    }

    while (this.isRunning) {
      try {
        const offset = this.botOffsets[botId] > 0 ? this.botOffsets[botId] : undefined;
        const updates: TelegramUpdate[] = await client.getUpdates({
          offset,
          timeout: 10,
          limit: 25,
        });

        for (const update of updates) {
          if (update.update_id >= this.botOffsets[botId]) {
            this.botOffsets[botId] = update.update_id + 1;
          }
          try {
            await telegramAdapter.handleWebhookUpdate(botId, update);
          } catch (handleErr) {
            console.error(
              `[Telegram Poller] Error handling update ${update.update_id} for ${botId}:`,
              handleErr
            );
          }
        }
      } catch (err: unknown) {
        if (!this.isRunning) break;
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('webhook is active')) {
          console.warn(`[Telegram Poller] Webhook was active for ${botId}, clearing now...`);
          try {
            await client.deleteWebhook();
          } catch {}
          await new Promise((res) => setTimeout(res, 1000));
          continue;
        }

        if (msg.includes('terminated by other getUpdates request')) {
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }

        if (!msg.includes('aborted') && !msg.includes('timed out')) {
          console.warn(`[Telegram Poller] Error polling ${botId}: ${msg}`);
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
  }
}

export const telegramPoller = new TelegramPoller();
