/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointAdapter, DeliveryResult } from '../base.js';
import {
  Delivery,
  Message,
  Endpoint,
  EndpointCapability,
  SystemEvent,
} from '../../types/index.js';
import { telegramRegistry } from './registry.js';
import { TelegramUpdate } from './client.js';
import { db } from '../../database/index.js';
import { PairingService } from '../../core/pairing.js';
import { PresenceService } from '../../core/presence.js';
import { MessagingService } from '../../core/messaging.js';
import { routingEngine } from '../../core/routing.js';
import { webEventBus } from '../web/adapter.js';

export class TelegramAdapter implements EndpointAdapter {
  public readonly type = 'telegram';
  public readonly capabilities: EndpointCapability[] = [
    'text',
    'image',
    'file',
    'voice',
    'video',
    'location',
    'interactive',
  ];

  // Idempotency: track recent processed update IDs per bot
  private processedUpdates = new Set<string>();
  private readonly maxTrackedUpdates = 4000;

  public async deliver(
    delivery: Delivery,
    message: Message,
    endpoint: Endpoint
  ): Promise<DeliveryResult> {
    const botId =
      (endpoint.metadata?.bot_id as 'bot_a' | 'bot_b') ||
      (endpoint.id.includes('bot_b') ? 'bot_b' : 'bot_a');
    let client = telegramRegistry.getClient(botId);

    if (!client || !client.hasToken()) {
      const fallbackId = botId === 'bot_b' ? 'bot_a' : 'bot_b';
      const fallback = telegramRegistry.getClient(fallbackId);
      if (fallback?.hasToken()) {
        client = fallback;
      } else {
        return {
          success: false,
          error: `Telegram bot [${botId}] token is not configured on the server.`,
        };
      }
    }

    const chatId = endpoint.external_id;
    const sender = db.users.get(message.sender_user_id);
    const senderName = sender?.display_name || 'Message Hub User';

    // Format message preserving clean communication without leaking internals
    const formattedText = `💬 [${senderName}]:\n${message.text}`;

    try {
      const sent = await client.sendMessage(chatId, formattedText);
      PresenceService.touch(endpoint.id);
      return {
        success: true,
        external_message_id: String(sent.message_id),
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  public async getStatus(): Promise<{ ready: boolean; details?: Record<string, unknown> }> {
    const [botA, botB] = await Promise.all([
      telegramRegistry.getBotStatus('bot_a'),
      telegramRegistry.getBotStatus('bot_b'),
    ]);
    const ready = botA.configured || botB.configured;
    return {
      ready,
      details: {
        bot_a: botA,
        bot_b: botB,
      },
    };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async safeReply(
    client: { hasToken(): boolean; sendMessage(chatId: string | number, text: string, options?: unknown): Promise<unknown> } | null,
    chatId: string | number,
    text: string,
    options?: { parse_mode?: 'HTML' | 'Markdown' }
  ) {
    if (client && client.hasToken()) {
      try {
        await client.sendMessage(chatId, text, options as any);
      } catch (err) {
        console.warn(`[TelegramAdapter] Failed formatted reply to ${chatId}:`, err);
        try {
          const plain = text.replace(/<[^>]+>/g, '').replace(/[*_`]/g, '');
          await client.sendMessage(chatId, plain);
        } catch (retryErr) {
          console.error(`[TelegramAdapter] Plaintext fallback failed:`, retryErr);
        }
      }
    } else {
      console.warn(`[TelegramAdapter] Cannot reply: client is not configured for chatId ${chatId}`);
    }
  }

  private extractPairingCode(text: string): string | null {
    if (!text) return null;
    const raw = text.trim();

    // Pattern 1: Explicit MH code with hyphen, underscore, space, or none
    // e.g. "MH-6P6N7", "MH_6P6N7", "MH6P6N7", "/start MH-6P6N7", "/start MH_6P6N7"
    const m1 = raw.match(/MH[-_\s]?([2-9A-Z]{5})/i);
    if (m1) {
      return `MH-${m1[1].toUpperCase()}`;
    }

    // Pattern 2: Deep link /start or /link followed by 5 chars
    // e.g. "/start 6P6N7", "/link 6P6N7"
    const m2 = raw.match(/^\/(?:start|link)\s+([2-9A-Z]{5})$/i);
    if (m2) {
      return `MH-${m2[1].toUpperCase()}`;
    }

    // Pattern 3: Exact 5 chars sent as the whole message
    // e.g. "6P6N7"
    const m3 = raw.match(/^([2-9A-Z]{5})$/i);
    if (m3) {
      const candidate = `MH-${m3[1].toUpperCase()}`;
      if (db.pairingCodes.get(candidate)) {
        return candidate;
      }
    }

    // Pattern 4: Russian or free text containing 5-char code (e.g. "мой код 6P6N7" or "код: 6P6N7")
    const m4 = raw.match(/(?:код|code)[:\s]+([2-9A-Z]{5})/i);
    if (m4) {
      return `MH-${m4[1].toUpperCase()}`;
    }

    // Pattern 5: Any active unexpired code from DB matching text
    try {
      const allCodes = db.pairingCodes.list ? db.pairingCodes.list() : [];
      for (const pc of allCodes) {
        if (!pc.used) {
          const shortPart = pc.code.replace('MH-', '');
          if (raw.toUpperCase().includes(shortPart)) {
            return pc.code;
          }
        }
      }
    } catch {}

    return null;
  }

  /**
   * Handle incoming Telegram webhook updates with idempotency and protocol normalization
   */
  public async handleWebhookUpdate(
    botId: 'bot_a' | 'bot_b',
    update: TelegramUpdate
  ): Promise<{ status: 'ok' | 'ignored' | 'error'; message?: string }> {
    // 1. Idempotency Check per bot
    if (!update || typeof update.update_id !== 'number') {
      return { status: 'error', message: 'Malformed update object' };
    }

    const updateKey = `${botId}:${update.update_id}`;
    if (this.processedUpdates.has(updateKey)) {
      return { status: 'ignored', message: 'Update already processed' };
    }

    // Record update ID
    this.processedUpdates.add(updateKey);
    if (this.processedUpdates.size > this.maxTrackedUpdates) {
      const first = this.processedUpdates.values().next().value;
      if (first !== undefined) this.processedUpdates.delete(first);
    }

    const tgMsg = update.message;
    if (!tgMsg || !tgMsg.chat || !tgMsg.text) {
      return { status: 'ignored', message: 'No text message in update' };
    }

    const chatId = String(tgMsg.chat.id);
    const text = tgMsg.text.trim();
    const fromUser = tgMsg.from;
    const client = telegramRegistry.getClient(botId);

    db.events.add({
      type: 'MESSAGE_RECEIVED',
      details: {
        bot_id: botId,
        chat_id: chatId,
        update_id: update.update_id,
        text_snippet: text.substring(0, 30),
      },
    });

    // 2. Check for pairing code in message
    const extractedCode = this.extractPairingCode(text);

    if (extractedCode) {
      const epId = `ep_tg_${botId}_${chatId}`;
      let endpoint = db.endpoints.get(epId);
      if (!endpoint) {
        endpoint = db.endpoints.findByTypeAndExternalId('telegram', chatId);
      }

      const pairingResult = PairingService.consumePairingCode(extractedCode, epId);
      if (!pairingResult.success || !pairingResult.user_id) {
        const err = pairingResult.error || 'Неверный или просроченный код';
        await this.safeReply(
          client,
          chatId,
          `❌ <b>Ошибка сопряжения:</b> ${this.escapeHtml(err)}\n\n` +
            `Пожалуйста, нажмите «Получить код» в интерфейсе Message Hub и отправьте новый код сюда.`,
          { parse_mode: 'HTML' }
        );
        return { status: 'ok', message: 'Pairing failed' };
      }

      // If an existing endpoint had a different ID (e.g. was linked to the other bot previously), remove it
      if (endpoint && endpoint.id !== epId) {
        db.endpoints.delete(endpoint.id);
      }

      const now = new Date().toISOString();
      const displayName = fromUser?.username
        ? `@${fromUser.username} (${botId === 'bot_b' ? 'Bot B' : 'Bot A'})`
        : `${fromUser?.first_name || 'Telegram User'} (${botId === 'bot_b' ? 'Bot B' : 'Bot A'})`;

      endpoint = {
        id: epId,
        user_id: pairingResult.user_id,
        type: 'telegram',
        external_id: chatId,
        display_name: displayName,
        status: 'online',
        capabilities: this.capabilities,
        created_at: endpoint?.created_at || now,
        last_seen_at: now,
        metadata: {
          bot_id: botId,
          username: fromUser?.username,
          first_name: fromUser?.first_name,
          last_name: fromUser?.last_name,
          telegram_user_id: fromUser?.id,
        },
      };

      db.endpoints.set(endpoint);
      PresenceService.setPresence(endpoint.id, 'online');

      // Notify web clients via SSE
      webEventBus.emit('message', {
        type: 'ENDPOINT_PAIRED',
        endpoint_id: endpoint.id,
        user_id: endpoint.user_id,
      });

      const user = db.users.get(pairingResult.user_id);
      const userName = user?.display_name || 'Пользователь Message Hub';
      const botName = botId === 'bot_b' ? '@Botchat1B_bot' : '@Botchat1A_bot';

      await this.safeReply(
        client,
        chatId,
        `✅ <b>Telegram успешно подключен к Message Hub!</b>\n\n` +
          `👤 Ваш профиль: <b>${this.escapeHtml(userName)}</b>\n` +
          `🤖 Активный бот: <b>${botName}</b>\n` +
          `🟢 Статус: <b>В сети (Online)</b>\n\n` +
          `💬 Теперь сообщения от собеседников из веб-клиента будут поступать сюда, а ваши ответы из Telegram моментально появятся у них в веб-интерфейсе!`,
        { parse_mode: 'HTML' }
      );

      // Flush any pending deliveries for this newly online endpoint
      await routingEngine.flushPendingDeliveries(endpoint.id);

      return { status: 'ok', message: 'Endpoint paired successfully' };
    }

    // 3. Command: /start (without pairing code)
    if (text === '/start' || text.startsWith('/start ')) {
      const botName = botId === 'bot_b' ? '@Botchat1B_bot' : '@Botchat1A_bot';
      await this.safeReply(
        client,
        chatId,
        `🌐 <b>Добро пожаловать в Message Hub!</b>\n\n` +
          `Message Hub — универсальная платформа связи, где ваша цифровая личность существует независимо от конкретного устройства или клиента.\n\n` +
          `<b>Как подключить этот Telegram-чат:</b>\n` +
          `1. В веб-интерфейсе Message Hub откройте панель <b>«Подключение Telegram»</b>\n` +
          `2. Нажмите кнопку <b>«Получить код»</b>\n` +
          `3. Нажмите кнопку «Открыть в Telegram» со ссылкой или отправьте полученный код сюда сообщением (например: <code>MH-6P6N7</code>)\n\n` +
          `<b>Команды:</b>\n` +
          `• <code>/status</code> — статус подключения\n` +
          `• <code>/help</code> — помощь`,
        { parse_mode: 'HTML' }
      );
      return { status: 'ok', message: 'Start command handled' };
    }

    // 4. Command: /help
    if (text.startsWith('/help')) {
      await this.safeReply(
        client,
        chatId,
        `📖 <b>Команды Message Hub:</b>\n\n` +
          `• <code>MH-XXXXX</code> или код сопряжения — привязать этот чат к вашему профилю Message Hub.\n` +
          `• <code>/status</code> — проверить текущий статус подключения и привязанного пользователя.\n` +
          `• Любой текст — после привязки любое ваше сообщение моментально доставляется собеседнику в веб-клиент!`,
        { parse_mode: 'HTML' }
      );
      return { status: 'ok', message: 'Help command handled' };
    }

    // 5. Command: /status
    if (text.startsWith('/status')) {
      const endpoint = db.endpoints.findByTypeAndExternalId('telegram', chatId);
      const botName = botId === 'bot_b' ? '@Botchat1B_bot' : '@Botchat1A_bot';
      if (!endpoint || endpoint.user_id === 'pending_pairing') {
        await this.safeReply(
          client,
          chatId,
          `ℹ️ <b>Статус подключения:</b>\n` +
            `Статус: <i>Не привязан</i>\n` +
            `Бот: <b>${botName}</b>\n\n` +
            `Чтобы привязать этот чат к вашему профилю, нажмите «Получить код» в веб-клиенте Message Hub и отправьте его сюда.`,
          { parse_mode: 'HTML' }
        );
      } else {
        const user = db.users.get(endpoint.user_id);
        const presence = PresenceService.getPresence(endpoint.id);
        await this.safeReply(
          client,
          chatId,
          `ℹ️ <b>Статус подключения:</b>\n` +
            `👤 Привязанный профиль: <b>${this.escapeHtml(user?.display_name || 'Неизвестно')}</b>\n` +
            `🤖 Активный бот: <b>${botName}</b>\n` +
            `🟢 Статус: <b>${presence?.status || 'online'}</b>`,
          { parse_mode: 'HTML' }
        );
      }
      return { status: 'ok', message: 'Status command handled' };
    }

    // 6. Regular message from Telegram
    const endpoint = db.endpoints.findByTypeAndExternalId('telegram', chatId);
    if (!endpoint || endpoint.user_id === 'pending_pairing') {
      await this.safeReply(
        client,
        chatId,
        `⚠️ <b>Этот чат еще не привязан к профилю Message Hub.</b>\n\n` +
          `Чтобы отправлять и получать сообщения, подключите чат:\n` +
          `1. В веб-клиенте нажмите <b>«Подключение Telegram»</b> ➔ <b>«Получить код»</b>\n` +
          `2. Отправьте полученный код сюда в чат.`,
        { parse_mode: 'HTML' }
      );
      return { status: 'ok', message: 'Message ignored: unlinked endpoint' };
    }

    // Update presence
    PresenceService.touch(endpoint.id);

    // Find conversation for this user
    let userConversations = db.conversations.findForUser(endpoint.user_id);
    let targetConv = userConversations[0];

    if (!targetConv) {
      // Find another user to initiate a direct conversation
      const allUsers = db.users.list().filter((u) => u.user_id !== endpoint.user_id);
      const partner = allUsers[0];
      if (partner) {
        targetConv = MessagingService.getOrCreateDirectConversation(endpoint.user_id, partner.user_id);
      } else {
        await this.safeReply(
          client,
          chatId,
          `⚠️ В системе Message Hub пока нет других пользователей для отправки сообщений.`
        );
        return { status: 'ok', message: 'No recipients available' };
      }
    }

    // Send through Core Messaging Service
    const { deliveries } = await MessagingService.sendMessage({
      senderUserId: endpoint.user_id,
      conversationId: targetConv.conversation_id,
      text,
      metadata: {
        origin_endpoint_id: endpoint.id,
        origin_bot_id: botId,
        origin_type: 'telegram',
      },
    });

    return {
      status: 'ok',
      message: `Message dispatched via core to ${deliveries.length} endpoints`,
    };
  }
}

export const telegramAdapter = new TelegramAdapter();
// Register in routing engine
routingEngine.registerAdapter('telegram', telegramAdapter);
