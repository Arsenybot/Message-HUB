/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from '../database/index.js';
import { Conversation, Delivery, Message, MessageAttachment } from '../types/index.js';
import { routingEngine } from './routing.js';
import { webEventBus } from '../adapters/web/adapter.js';

export class MessagingService {
  /**
   * Create or fetch a direct conversation between two users
   */
  public static getOrCreateDirectConversation(userAId: string, userBId: string): Conversation {
    const existing = db.conversations.findDirectBetween(userAId, userBId);
    if (existing) {
      return existing;
    }

    const userA = db.users.get(userAId);
    const userB = db.users.get(userBId);
    const title = `${userA?.display_name || 'User'} & ${userB?.display_name || 'User'}`;
    const now = new Date().toISOString();

    const conv: Conversation = {
      conversation_id: `conv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      type: 'direct',
      title,
      created_at: now,
      updated_at: now,
    };

    db.conversations.set(conv);
    db.conversationMembers.add({
      conversation_id: conv.conversation_id,
      user_id: userAId,
      joined_at: now,
    });
    db.conversationMembers.add({
      conversation_id: conv.conversation_id,
      user_id: userBId,
      joined_at: now,
    });

    return conv;
  }

  /**
   * Send a universal message through the Message Hub.
   * This decoupled core function works identically regardless of whether the message
   * originated from Web, Telegram, or any future interface.
   */
  public static async sendMessage(params: {
    senderUserId: string;
    conversationId: string;
    text: string;
    contentType?: 'text' | 'image' | 'file' | 'voice' | 'location';
    attachments?: MessageAttachment[];
    metadata?: Record<string, unknown>;
  }): Promise<{ message: Message; deliveries: Delivery[] }> {
    const { senderUserId, conversationId, text, contentType = 'text', attachments, metadata } = params;

    // Validate membership
    if (!db.conversationMembers.isMember(conversationId, senderUserId)) {
      throw new Error(`User ${senderUserId} is not a member of conversation ${conversationId}`);
    }

    const now = new Date().toISOString();
    const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const cleanText = text.trim();

    const message: Message = {
      message_id: messageId,
      conversation_id: conversationId,
      sender_user_id: senderUserId,
      content_type: contentType,
      text: cleanText,
      attachments,
      created_at: now,
      metadata,
    };

    // Store in message database
    db.messages.set(message);

    db.events.add({
      type: 'MESSAGE_CREATED',
      message_id: messageId,
      user_id: senderUserId,
      details: {
        conversation_id: conversationId,
        content_type: contentType,
        text_length: text.length,
      },
    });

    // Find all other members in conversation
    const members = db.conversationMembers.findByConversationId(conversationId);
    const recipientUserIds = members
      .map((m) => m.user_id)
      .filter((uid) => uid !== senderUserId);

    // Core Routing
    const deliveries = await routingEngine.routeMessage(message, recipientUserIds);

    // Broadcast new message to all active SSE web clients
    webEventBus.emit('message', {
      type: 'MESSAGE_CREATED',
      conversation_id: conversationId,
      message,
    });

    return { message, deliveries };
  }

  /**
   * Retrieve messages with their delivery records
   */
  public static getConversationMessagesWithDeliveries(
    conversationId: string
  ): Array<Message & { deliveries: Delivery[] }> {
    const messages = db.messages.findByConversationId(conversationId);
    return messages.map((msg) => {
      const deliveries = db.deliveries.findByMessageId(msg.message_id);
      return {
        ...msg,
        deliveries,
      };
    });
  }

  /**
   * Mark delivery as read
   */
  public static markDeliveryRead(deliveryId: string): void {
    db.deliveries.updateStatus(deliveryId, 'read');
  }

  /**
   * Delete conversation, its members, and its messages
   */
  public static deleteConversation(conversationId: string, userId: string): boolean {
    if (!db.conversationMembers.isMember(conversationId, userId)) {
      throw new Error(`User ${userId} is not a member of conversation ${conversationId}`);
    }

    const deleted = db.conversations.delete(conversationId);
    if (deleted) {
      db.events.add({
        type: 'CONVERSATION_DELETED',
        user_id: userId,
        details: {
          action: 'CONVERSATION_DELETED',
          conversation_id: conversationId,
        },
      });

      webEventBus.emit('message', {
        type: 'CONVERSATION_DELETED',
        conversation_id: conversationId,
        user_id: userId,
      });
    }
    return deleted;
  }
}
