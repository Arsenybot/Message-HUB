/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from '../database/index.js';
import { User, Endpoint, EndpointCapability } from '../types/index.js';
import { webEventBus } from '../adapters/web/adapter.js';

export class IdentityService {
  /**
   * Create a pure Message Hub identity.
   * Identity is NOT tied to any specific device, web session, or Telegram account.
   */
  public static createIdentity(displayName?: string): User {
    const randomHex = crypto.randomBytes(4).toString('hex');
    const user: User = {
      user_id: `usr_${Date.now().toString(36)}_${randomHex}`,
      display_name: displayName?.trim() || `User_${randomHex.toUpperCase()}`,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    db.users.set(user);

    db.events.add({
      type: 'ENDPOINT_CONNECTED',
      user_id: user.user_id,
      details: {
        action: 'IDENTITY_CREATED',
        display_name: user.display_name,
      },
    });

    return user;
  }

  public static getIdentity(userId: string): User | null {
    return db.users.get(userId);
  }

  public static listIdentities(): User[] {
    return db.users.list();
  }

  /**
   * Create a Web Endpoint for a user.
   */
  public static createWebEndpoint(
    userId: string,
    displayName = 'Web Client',
    clientIp = '127.0.0.1'
  ): Endpoint {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const endpointId = `ep_web_${userId}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const capabilities: EndpointCapability[] = [
      'text',
      'image',
      'file',
      'notification',
      'interactive',
    ];

    const endpoint: Endpoint = {
      id: endpointId,
      user_id: userId,
      type: 'web',
      external_id: `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      display_name: displayName,
      status: 'online',
      capabilities,
      created_at: now,
      last_seen_at: now,
      metadata: {
        client_ip: clientIp,
      },
    };

    db.endpoints.set(endpoint);
    db.presence.set({ endpoint_id: endpoint.id, status: 'online', last_seen_at: now });

    db.events.add({
      type: 'ENDPOINT_CONNECTED',
      user_id: userId,
      endpoint_id: endpoint.id,
      details: {
        type: 'web',
        display_name: endpoint.display_name,
      },
    });

    return endpoint;
  }

  /**
   * Ownership verification: User A cannot manage User B's endpoint.
   */
  public static assertUserOwnsEndpoint(userId: string, endpointId: string): boolean {
    const endpoint = db.endpoints.get(endpointId);
    if (!endpoint) return false;
    return endpoint.user_id === userId;
  }

  /**
   * Conversation membership check: User cannot peek into conversations they don't belong to.
   */
  public static assertUserInConversation(userId: string, conversationId: string): boolean {
    return db.conversationMembers.isMember(conversationId, userId);
  }

  /**
   * Delete an identity and clean up its endpoints, presence, and memberships.
   */
  public static deleteIdentity(userId: string): boolean {
    const user = db.users.get(userId);
    if (!user) return false;

    // Delete endpoints and their presence
    const userEndpoints = db.endpoints.findByUserId(userId);
    for (const ep of userEndpoints) {
      db.endpoints.delete(ep.id);
    }

    // Clean up pairing codes
    db.pairingCodes.deleteByUser(userId);

    // Remove user from conversation memberships
    db.conversationMembers.removeByUser(userId);

    // Delete the user record
    const deleted = db.users.delete(userId);

    db.events.add({
      type: 'ENDPOINT_DISCONNECTED',
      user_id: userId,
      details: {
        action: 'IDENTITY_DELETED',
        display_name: user.display_name,
      },
    });

    webEventBus.emit('message', {
      type: 'IDENTITY_DELETED',
      user_id: userId,
    });

    return deleted;
  }
}
