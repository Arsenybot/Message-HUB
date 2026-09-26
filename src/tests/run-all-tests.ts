/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../database/index.js';
import { IdentityService } from '../core/identity.js';
import { PairingService } from '../core/pairing.js';
import { PresenceService } from '../core/presence.js';
import { MessagingService } from '../core/messaging.js';
import { routingEngine } from '../core/routing.js';
import { initializeAdapters, telegramAdapter, webAdapter } from '../adapters/index.js';
import { Endpoint, Message } from '../types/index.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING MESSAGE HUB ITERATION 0 AUTOMATED TEST SUITE');
  console.log('======================================================\n');

  // Reset database for clean test run
  db.clearAll();
  initializeAdapters();

  // -------------------------------------------------------------------
  // TEST 1: Identity Creation (Decoupled from client/endpoint)
  // -------------------------------------------------------------------
  console.log('Test Suite 1: Identity & Endpoint Decoupling');
  const userA = IdentityService.createIdentity('Alice Tester');
  const userB = IdentityService.createIdentity('Bob Tester');

  assert(
    Boolean(userA.user_id && userA.user_id.startsWith('usr_')),
    'Identity A created with unique user_id'
  );
  assert(
    userA.user_id !== userB.user_id,
    'Identity A and Identity B have distinct identities'
  );
  assert(
    userA.display_name === 'Alice Tester',
    'Identity display name is preserved'
  );

  // -------------------------------------------------------------------
  // TEST 2: Pairing Code Generation & Format
  // -------------------------------------------------------------------
  console.log('\nTest Suite 2: Pairing Codes');
  const pairingCode = PairingService.createPairingCode(userA.user_id);
  assert(
    /^MH-[A-Z0-9]{5}$/.test(pairingCode.code),
    `Pairing code format matches MH-XXXXX (${pairingCode.code})`
  );
  assert(
    pairingCode.user_id === userA.user_id,
    'Pairing code is associated with target identity'
  );
  assert(pairingCode.used === false, 'Pairing code is unused initially');

  // -------------------------------------------------------------------
  // TEST 3: Pairing Code One-Time Use & Burning
  // -------------------------------------------------------------------
  const dummyEndpointId = 'ep_tg_test_1001';
  const firstConsume = PairingService.consumePairingCode(pairingCode.code, dummyEndpointId);
  assert(
    Boolean(firstConsume.success && firstConsume.user_id === userA.user_id),
    'Pairing code can be consumed successfully on first attempt'
  );

  const secondConsume = PairingService.consumePairingCode(pairingCode.code, dummyEndpointId);
  assert(
    Boolean(!secondConsume.success && secondConsume.error?.includes('already been used')),
    'Pairing code cannot be reused (one-time burn enforced)'
  );

  // -------------------------------------------------------------------
  // TEST 4: Pairing Code Expiration
  // -------------------------------------------------------------------
  const expiredCodeItem = PairingService.createPairingCode(userB.user_id);
  // Force expiration in database
  const inDb = db.pairingCodes.get(expiredCodeItem.code);
  if (inDb) {
    inDb.expires_at = new Date(Date.now() - 5000).toISOString();
    db.pairingCodes.set(inDb);
  }
  const expiredConsume = PairingService.consumePairingCode(expiredCodeItem.code, 'ep_test_expired');
  assert(
    Boolean(!expiredConsume.success && expiredConsume.error?.includes('expired')),
    'Expired pairing code is rejected'
  );

  // -------------------------------------------------------------------
  // TEST 5: Endpoint Linking to User Identity
  // -------------------------------------------------------------------
  console.log('\nTest Suite 3: Endpoint Linking & Multi-Interface Ownership');
  const webEpA = IdentityService.createWebEndpoint(userA.user_id, 'Alice Web Client');
  assert(webEpA.user_id === userA.user_id, 'Web endpoint belongs to Alice');

  // Link a Telegram endpoint to Alice via /link command simulation
  const pairingAliceTg = PairingService.createPairingCode(userA.user_id);
  const linkUpdate = {
    update_id: 10001,
    message: {
      message_id: 1,
      from: { id: 998877, is_bot: false, first_name: 'AliceTG', username: 'alicetg' },
      chat: { id: 998877, type: 'private' as const, first_name: 'AliceTG' },
      date: Math.floor(Date.now() / 1000),
      text: `/link ${pairingAliceTg.code}`,
    },
  };

  const linkResult = await telegramAdapter.handleWebhookUpdate('bot_a', linkUpdate);
  assert(linkResult.status === 'ok', 'Telegram /link processed successfully');

  const tgEndpointAlice = db.endpoints.findByTypeAndExternalId('telegram', '998877');
  assert(
    tgEndpointAlice !== null && tgEndpointAlice.user_id === userA.user_id,
    'Telegram endpoint is now linked to Alice identity (User A has both Web and Telegram)'
  );

  const aliceEndpoints = db.endpoints.findByUserId(userA.user_id);
  assert(
    aliceEndpoints.length === 2,
    `Alice has 2 connected interfaces: ${aliceEndpoints.map((e) => e.type).join(', ')}`
  );

  // -------------------------------------------------------------------
  // TEST 6: Conversation Creation & Membership
  // -------------------------------------------------------------------
  console.log('\nTest Suite 4: Messaging & Routing Core');
  const conv = MessagingService.getOrCreateDirectConversation(userA.user_id, userB.user_id);
  assert(Boolean(conv.conversation_id), 'Direct conversation created');
  assert(
    IdentityService.assertUserInConversation(userA.user_id, conv.conversation_id),
    'Alice is member of conversation'
  );
  assert(
    IdentityService.assertUserInConversation(userB.user_id, conv.conversation_id),
    'Bob is member of conversation'
  );

  // -------------------------------------------------------------------
  // TEST 7: Offline Delivery Queuing (Bob Web endpoint is offline)
  // -------------------------------------------------------------------
  const bobWebEp = IdentityService.createWebEndpoint(userB.user_id, 'Bob Web Client');
  // Explicitly set Bob endpoint offline
  PresenceService.setPresence(bobWebEp.id, 'offline');

  const sendResult1 = await MessagingService.sendMessage({
    senderUserId: userA.user_id,
    conversationId: conv.conversation_id,
    text: 'Hello Bob! This is message 1.',
  });

  assert(
    Boolean(sendResult1.message && sendResult1.message.message_id),
    'Message created in core independent of interface'
  );
  assert(
    sendResult1.deliveries.length === 1,
    'One delivery created for Bob capable endpoint'
  );
  assert(
    sendResult1.deliveries[0].status === 'pending',
    'Delivery is marked PENDING because recipient endpoint is offline'
  );

  // Verify message is stored in DB
  const storedMsg = db.messages.get(sendResult1.message.message_id);
  assert(storedMsg !== null, 'Message persisted in storage');

  // -------------------------------------------------------------------
  // TEST 8: Pending Delivery Flush on Reconnect
  // -------------------------------------------------------------------
  console.log('\nTest Suite 5: Reconnect & Offline Queue Flush');
  const pendingBefore = db.deliveries.findPendingForEndpoint(bobWebEp.id);
  assert(pendingBefore.length === 1, '1 delivery waiting in pending queue for Bob');

  // Bob comes online
  PresenceService.setPresence(bobWebEp.id, 'online');
  const flushedCount = await routingEngine.flushPendingDeliveries(bobWebEp.id);

  assert(flushedCount === 1, 'Flushed 1 pending delivery upon coming online');
  const updatedDelivery = db.deliveries.get(sendResult1.deliveries[0].delivery_id);
  assert(
    updatedDelivery?.status === 'delivered',
    'Delivery status transitioned from PENDING to DELIVERED'
  );

  // -------------------------------------------------------------------
  // TEST 9: Duplicate Telegram Update Idempotency
  // -------------------------------------------------------------------
  console.log('\nTest Suite 6: Telegram Idempotency & Duplicate Protection');
  const textUpdate = {
    update_id: 20002,
    message: {
      message_id: 2,
      from: { id: 998877, is_bot: false, first_name: 'AliceTG' },
      chat: { id: 998877, type: 'private' as const, first_name: 'AliceTG' },
      date: Math.floor(Date.now() / 1000),
      text: 'Message from Telegram Alice',
    },
  };

  const firstMsgProcess = await telegramAdapter.handleWebhookUpdate('bot_a', textUpdate);
  assert(firstMsgProcess.status === 'ok', 'First incoming update processed');

  const secondMsgProcess = await telegramAdapter.handleWebhookUpdate('bot_a', textUpdate);
  assert(
    Boolean(secondMsgProcess.status === 'ignored' && secondMsgProcess.message?.includes('already processed')),
    'Duplicate incoming update with same update_id is ignored (Idempotency confirmed)'
  );

  // -------------------------------------------------------------------
  // TEST 10: Security Isolation (User A cannot access User B data)
  // -------------------------------------------------------------------
  console.log('\nTest Suite 7: Security & Permission Boundaries');
  const userC = IdentityService.createIdentity('Eve Eavesdropper');
  assert(
    !IdentityService.assertUserInConversation(userC.user_id, conv.conversation_id),
    'User C is blocked from accessing Alice & Bob conversation'
  );

  assert(
    !IdentityService.assertUserOwnsEndpoint(userC.user_id, webEpA.id),
    'User C cannot access or modify Alice endpoint'
  );
  assert(
    !IdentityService.assertUserOwnsEndpoint(userA.user_id, bobWebEp.id),
    'User A cannot access or modify Bob endpoint'
  );

  // -------------------------------------------------------------------
  // TEST 11: Delivery Failure Handling (No fake success)
  // -------------------------------------------------------------------
  console.log('\nTest Suite 8: Real Delivery Failure Handling');
  // Attempt to deliver through Telegram adapter with invalid/unreachable bot token
  const fakeDelivery = {
    delivery_id: 'delv_fail_test',
    message_id: 'msg_fail_test',
    endpoint_id: 'ep_fake_tg',
    recipient_user_id: userB.user_id,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };

  const fakeTgEndpoint: Endpoint = {
    id: 'ep_fake_tg',
    user_id: userB.user_id,
    type: 'telegram',
    external_id: '999999999',
    display_name: 'Unreachable Bot',
    status: 'online',
    capabilities: ['text'],
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    metadata: { bot_id: 'bot_b' },
  };

  const failResult = await telegramAdapter.deliver(
    fakeDelivery,
    {
      message_id: 'msg_fail_test',
      conversation_id: 'conv_test',
      sender_user_id: userA.user_id,
      content_type: 'text',
      text: 'Test unreachable delivery',
      created_at: new Date().toISOString(),
    },
    fakeTgEndpoint
  );

  assert(
    failResult.success === false && Boolean(failResult.error),
    'Delivery explicitly reports failure when bot cannot deliver (No fake success)'
  );

  // -------------------------------------------------------------------
  // TEST 9: Conversation Deletion & Endpoint Restoration
  // -------------------------------------------------------------------
  console.log('\nTest Suite 9: Conversation Deletion & Endpoint Restoration');
  // Deleting conversation
  const testConv = MessagingService.getOrCreateDirectConversation(userA.user_id, userB.user_id);
  assert(Boolean(db.conversations.get(testConv.conversation_id)), 'Test conversation exists before deletion');
  const deleteResult = MessagingService.deleteConversation(testConv.conversation_id, userA.user_id);
  assert(deleteResult === true, 'Conversation was deleted by member');
  assert(db.conversations.get(testConv.conversation_id) === null, 'Conversation is removed from database');
  assert(db.conversationMembers.findByConversationId(testConv.conversation_id).length === 0, 'Conversation members cleared');

  // Web Endpoint Restoration
  const restoredWeb = IdentityService.createWebEndpoint(userA.user_id, 'Restored Web Client');
  assert(restoredWeb.type === 'web' && restoredWeb.status === 'online', 'Web endpoint created/restored with online status');
  assert(db.endpoints.get(restoredWeb.id) !== null, 'Restored web endpoint exists in database');

  // -------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('======================================================\n');

  // Restore clean demo seed for the application
  db.seedDefaults(true);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
