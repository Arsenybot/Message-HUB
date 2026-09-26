/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/index.js';
import { IdentityService } from '../core/identity.js';
import { PairingService } from '../core/pairing.js';
import { PresenceService } from '../core/presence.js';
import { MessagingService } from '../core/messaging.js';
import { routingEngine } from '../core/routing.js';
import { telegramAdapter } from '../adapters/telegram/adapter.js';
import { telegramRegistry } from '../adapters/telegram/registry.js';
import { webEventBus } from '../adapters/web/adapter.js';
import { SystemDiagnostics, EndpointStatus } from '../types/index.js';

export const apiRouter = Router();

// Helper to get active user ID from request header
function getAuthUserId(req: Request): string {
  const userId = req.headers['x-user-id'] as string;
  if (userId && db.users.get(userId)) {
    return userId;
  }
  // Default to first user if none provided
  const users = db.users.list();
  if (users.length > 0) {
    return users[0].user_id;
  }
  const created = IdentityService.createIdentity('Alex Rivera (User A)');
  return created.user_id;
}

// ----------------------------------------------------
// 1. Identity & Auth Endpoints
// ----------------------------------------------------

apiRouter.get('/me', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const user = db.users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const endpoints = db.endpoints.findByUserId(userId);
  return res.json({
    user,
    endpoints,
  });
});

apiRouter.get('/users', (req: Request, res: Response) => {
  const users = db.users.list();
  return res.json({ users });
});

apiRouter.post('/users', (req: Request, res: Response) => {
  const { display_name } = req.body || {};
  const user = IdentityService.createIdentity(display_name);

  // Automatically attach initial web endpoint for the newly created user
  const endpoint = IdentityService.createWebEndpoint(user.user_id, `${user.display_name} Web`);

  return res.status(201).json({ user, endpoint });
});

apiRouter.delete('/users/:id', (req: Request, res: Response) => {
  const userId = req.params.id;
  const user = db.users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Identity not found' });
  }

  IdentityService.deleteIdentity(userId);
  return res.json({
    success: true,
    message: `Identity ${user.display_name} deleted`,
    deleted_user_id: userId,
  });
});

// ----------------------------------------------------
// 2. Endpoints & Pairing
// ----------------------------------------------------

apiRouter.get('/endpoints', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const endpoints = db.endpoints.findByUserId(userId);
  return res.json({ endpoints });
});

apiRouter.post('/endpoints/pairing', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  try {
    const pairing = PairingService.createPairingCode(userId);
    return res.json({ pairing });
  } catch (err: unknown) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Restore or connect Web endpoint for current user (e.g. after unlink or disconnect)
apiRouter.post('/endpoints/web', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const user = db.users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if an active web endpoint already exists
  const existingEndpoints = db.endpoints.findByUserId(userId);
  const existingWeb = existingEndpoints.find((e) => e.type === 'web');
  if (existingWeb) {
    // If it exists but is offline, set it to online
    if (existingWeb.status !== 'online') {
      PresenceService.setPresence(existingWeb.id, 'online');
    }
    return res.json({ endpoint: db.endpoints.get(existingWeb.id) });
  }

  const endpoint = IdentityService.createWebEndpoint(userId, `${user.display_name} Web`);
  webEventBus.emit('message', {
    type: 'ENDPOINT_CONNECTED',
    endpoint_id: endpoint.id,
    user_id: userId,
  });

  return res.status(201).json({ endpoint });
});

apiRouter.delete('/endpoints/:id', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const endpointId = req.params.id;

  // Strict ownership check
  if (!IdentityService.assertUserOwnsEndpoint(userId, endpointId)) {
    db.events.add({
      type: 'SECURITY_VIOLATION',
      user_id: userId,
      endpoint_id: endpointId,
      details: {
        action: 'UNLINK_UNOWNED_ENDPOINT_ATTEMPT',
      },
    });
    return res.status(403).json({ error: 'Forbidden: You do not own this endpoint.' });
  }

  const deleted = db.endpoints.delete(endpointId);
  db.events.add({
    type: 'ENDPOINT_DISCONNECTED',
    user_id: userId,
    endpoint_id: endpointId,
    details: {
      action: 'ENDPOINT_UNLINKED',
    },
  });

  return res.json({ success: deleted });
});

apiRouter.put('/endpoints/:id/presence', async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const endpointId = req.params.id;
  const { status } = req.body as { status: EndpointStatus };

  if (!status || !['online', 'offline', 'unknown'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Ownership check
  if (!IdentityService.assertUserOwnsEndpoint(userId, endpointId)) {
    return res.status(403).json({ error: 'Forbidden: You do not own this endpoint.' });
  }

  const presence = PresenceService.setPresence(endpointId, status);

  // If newly online, flush pending messages!
  let flushedCount = 0;
  if (status === 'online') {
    flushedCount = await routingEngine.flushPendingDeliveries(endpointId);
  }

  return res.json({ presence, flushed_deliveries: flushedCount });
});

// ----------------------------------------------------
// 3. Conversations & Messages
// ----------------------------------------------------

apiRouter.get('/conversations', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const conversations = db.conversations.findForUser(userId);
  return res.json({ conversations });
});

apiRouter.post('/conversations', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const { recipient_user_id } = req.body || {};

  if (!recipient_user_id) {
    return res.status(400).json({ error: 'recipient_user_id is required' });
  }

  if (recipient_user_id === userId) {
    return res.status(400).json({ error: 'Cannot create direct conversation with self' });
  }

  const conv = MessagingService.getOrCreateDirectConversation(userId, recipient_user_id);
  return res.json({ conversation: conv });
});

apiRouter.delete('/conversations/:id', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const convId = req.params.id;

  const conv = db.conversations.get(convId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Strict membership check
  if (!IdentityService.assertUserInConversation(userId, convId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a member of this conversation.' });
  }

  try {
    const success = MessagingService.deleteConversation(convId, userId);
    return res.json({ success, conversation_id: convId });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

apiRouter.get('/conversations/:id/messages', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const convId = req.params.id;

  // Strict membership check
  if (!IdentityService.assertUserInConversation(userId, convId)) {
    db.events.add({
      type: 'SECURITY_VIOLATION',
      user_id: userId,
      details: {
        action: 'UNAUTHORIZED_CONVERSATION_ACCESS',
        conversation_id: convId,
      },
    });
    return res.status(403).json({ error: 'Forbidden: You are not a member of this conversation.' });
  }

  const messagesWithDeliveries = MessagingService.getConversationMessagesWithDeliveries(convId);
  return res.json({ messages: messagesWithDeliveries });
});

apiRouter.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const convId = req.params.id;
  const { text, content_type = 'text', attachments } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  // Strict membership check
  if (!IdentityService.assertUserInConversation(userId, convId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a member of this conversation.' });
  }

  try {
    const result = await MessagingService.sendMessage({
      senderUserId: userId,
      conversationId: convId,
      text: text.trim(),
      contentType: content_type,
      attachments,
      metadata: {
        origin: 'web_client',
      },
    });

    return res.status(201).json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ----------------------------------------------------
// 4. Presence & Live SSE
// ----------------------------------------------------

apiRouter.get('/presence', (req: Request, res: Response) => {
  const presences = db.presence.list();
  return res.json({ presences });
});

// Server-Sent Events stream for instant updates in Web Client
apiRouter.get('/events/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onMessage = (payload: unknown) => {
    res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  webEventBus.on('message', onMessage);

  // Keep-alive heartbeat
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    webEventBus.off('message', onMessage);
  });
});

// ----------------------------------------------------
// 5. Telegram Integration Webhook
// ----------------------------------------------------

apiRouter.post('/integrations/telegram/webhook/:botId', async (req: Request, res: Response) => {
  const botId = req.params.botId as 'bot_a' | 'bot_b';
  if (botId !== 'bot_a' && botId !== 'bot_b') {
    return res.status(400).json({ error: 'Invalid bot ID' });
  }

  const update = req.body;
  try {
    const result = await telegramAdapter.handleWebhookUpdate(botId, update);
    return res.json(result);
  } catch (err: unknown) {
    console.error(`[Telegram Webhook Error - ${botId}]`, err);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

apiRouter.post('/integrations/telegram/setup-webhook', async (req: Request, res: Response) => {
  const { bot_id = 'bot_a', app_url } = req.body || {};
  const targetUrl = app_url || process.env.APP_URL || '';

  if (!targetUrl) {
    return res.status(400).json({ error: 'APP_URL is required to register webhook.' });
  }

  const result = await telegramRegistry.setupWebhook(bot_id, targetUrl);
  return res.json(result);
});

// ----------------------------------------------------
// 6. Diagnostics & Audit Events
// ----------------------------------------------------

apiRouter.get('/diagnostics', async (req: Request, res: Response) => {
  const [botA, botB] = await Promise.all([
    telegramRegistry.getBotStatus('bot_a'),
    telegramRegistry.getBotStatus('bot_b'),
  ]);

  const endpoints = db.endpoints.list();
  const onlineCount = endpoints.filter((e) => e.status === 'online').length;
  const deliveries = db.deliveries.list();
  const pendingCount = deliveries.filter((d) => d.status === 'pending').length;
  const failedCount = deliveries.filter((d) => d.status === 'failed').length;

  const diagnostics: SystemDiagnostics = {
    status: botA.configured || botB.configured ? 'healthy' : 'degraded',
    app_url: process.env.APP_URL || 'http://localhost:3000',
    environment: process.env.NODE_ENV || 'development',
    active_users: db.users.list().length,
    total_endpoints: endpoints.length,
    online_endpoints: onlineCount,
    total_messages: db.messages.list().length,
    total_deliveries: deliveries.length,
    pending_deliveries: pendingCount,
    failed_deliveries: failedCount,
    telegram_bots: {
      bot_a: botA,
      bot_b: botB,
    },
    recent_events: db.events.list(50),
  };

  return res.json(diagnostics);
});

apiRouter.post('/database/reset', (_req: Request, res: Response) => {
  db.seedDefaults(true);
  return res.json({ success: true, message: 'Database reset to default demo identities' });
});
