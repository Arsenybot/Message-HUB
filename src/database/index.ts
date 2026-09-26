/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  User,
  Endpoint,
  Conversation,
  ConversationMember,
  Message,
  Delivery,
  PairingCode,
  Presence,
  SystemEvent,
  EndpointType,
  DeliveryStatus,
} from '../types/index.js';

interface DatabaseSchema {
  users: Record<string, User>;
  endpoints: Record<string, Endpoint>;
  conversations: Record<string, Conversation>;
  conversation_members: ConversationMember[];
  messages: Record<string, Message>;
  deliveries: Record<string, Delivery>;
  pairing_codes: Record<string, PairingCode>;
  presence: Record<string, Presence>;
  events: SystemEvent[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'message_hub_db.json');

class StorageManager {
  private state: DatabaseSchema = {
    users: {},
    endpoints: {},
    conversations: {},
    conversation_members: [],
    messages: {},
    deliveries: {},
    pairing_codes: {},
    presence: {},
    events: [],
  };

  private isPersisting = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
    this.seedDefaults(false);
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const loadedEndpoints = parsed.endpoints || {};

        // Sanitize any mock or fictitious test endpoints
        for (const [id, ep] of Object.entries(loadedEndpoints as Record<string, Endpoint>)) {
          if (
            ep.external_id === '111111' ||
            ep.external_id === '222222' ||
            ep.external_id === '998877' ||
            ep.user_id === 'pending_pairing'
          ) {
            delete loadedEndpoints[id];
          }
        }

        this.state = {
          users: parsed.users || {},
          endpoints: loadedEndpoints,
          conversations: parsed.conversations || {},
          conversation_members: parsed.conversation_members || [],
          messages: parsed.messages || {},
          deliveries: parsed.deliveries || {},
          pairing_codes: parsed.pairing_codes || {},
          presence: parsed.presence || {},
          events: parsed.events || [],
        };
      }
    } catch (err) {
      console.warn('[Database] Failed to read database from disk, using fresh state', err);
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 100);
  }

  public saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to write database to disk', err);
    }
  }

  public seedDefaults(force = false) {
    // If force or no users exist, create two initial identities for instant demonstration
    if (force || Object.keys(this.state.users).length === 0) {
      if (force) {
        this.state = {
          users: {},
          endpoints: {},
          conversations: {},
          conversation_members: [],
          messages: {},
          deliveries: {},
          pairing_codes: {},
          presence: {},
          events: [],
        };
      }
      const now = new Date().toISOString();
      const userA: User = {
        user_id: 'usr_alpha_01',
        display_name: 'Alex Rivera (User A)',
        created_at: now,
      };
      const userB: User = {
        user_id: 'usr_beta_02',
        display_name: 'Sam Chen (User B)',
        created_at: now,
      };
      this.state.users[userA.user_id] = userA;
      this.state.users[userB.user_id] = userB;

      // Seed web endpoints
      const epA: Endpoint = {
        id: 'ep_web_user_a',
        user_id: userA.user_id,
        type: 'web',
        external_id: 'web_session_user_a',
        display_name: 'Alex Web Client',
        status: 'online',
        capabilities: ['text', 'image', 'file', 'notification', 'interactive'],
        created_at: now,
        last_seen_at: now,
        metadata: { client: 'Web Applet' },
      };
      const epB: Endpoint = {
        id: 'ep_web_user_b',
        user_id: userB.user_id,
        type: 'web',
        external_id: 'web_session_user_b',
        display_name: 'Sam Web Client',
        status: 'offline',
        capabilities: ['text', 'image', 'file', 'notification', 'interactive'],
        created_at: now,
        last_seen_at: now,
        metadata: { client: 'Web Applet' },
      };
      this.state.endpoints[epA.id] = epA;
      this.state.endpoints[epB.id] = epB;

      this.state.presence[epA.id] = { endpoint_id: epA.id, status: 'online', last_seen_at: now };
      this.state.presence[epB.id] = { endpoint_id: epB.id, status: 'offline', last_seen_at: now };

      // Seed direct conversation between User A and User B
      const conv: Conversation = {
        conversation_id: 'conv_alpha_beta',
        type: 'direct',
        title: 'Alex Rivera & Sam Chen',
        created_at: now,
        updated_at: now,
      };
      this.state.conversations[conv.conversation_id] = conv;
      this.state.conversation_members.push(
        { conversation_id: conv.conversation_id, user_id: userA.user_id, joined_at: now },
        { conversation_id: conv.conversation_id, user_id: userB.user_id, joined_at: now }
      );

      this.saveToDisk();
    }
  }

  // --- Users Collection ---
  public users = {
    get: (userId: string): User | null => this.state.users[userId] || null,
    set: (user: User): void => {
      this.state.users[user.user_id] = user;
      this.scheduleSave();
    },
    list: (): User[] => Object.values(this.state.users),
    delete: (userId: string): boolean => {
      if (this.state.users[userId]) {
        delete this.state.users[userId];
        this.scheduleSave();
        return true;
      }
      return false;
    },
  };

  // --- Endpoints Collection ---
  public endpoints = {
    get: (endpointId: string): Endpoint | null => this.state.endpoints[endpointId] || null,
    findByUserId: (userId: string): Endpoint[] =>
      Object.values(this.state.endpoints).filter(
        (ep) =>
          ep.user_id === userId &&
          ep.external_id !== '111111' &&
          ep.external_id !== '222222' &&
          ep.external_id !== '998877' &&
          ep.user_id !== 'pending_pairing'
      ),
    findByTypeAndExternalId: (type: EndpointType, externalId: string): Endpoint | null => {
      return (
        Object.values(this.state.endpoints).find(
          (ep) => ep.type === type && ep.external_id === String(externalId)
        ) || null
      );
    },
    list: (): Endpoint[] =>
      Object.values(this.state.endpoints).filter(
        (ep) =>
          ep.external_id !== '111111' &&
          ep.external_id !== '222222' &&
          ep.external_id !== '998877' &&
          ep.user_id !== 'pending_pairing'
      ),
    set: (endpoint: Endpoint): void => {
      this.state.endpoints[endpoint.id] = endpoint;
      this.scheduleSave();
    },
    updateStatus: (endpointId: string, status: Endpoint['status']): Endpoint | null => {
      const ep = this.state.endpoints[endpointId];
      if (ep) {
        ep.status = status;
        ep.last_seen_at = new Date().toISOString();
        this.scheduleSave();
        return ep;
      }
      return null;
    },
    delete: (endpointId: string): boolean => {
      if (this.state.endpoints[endpointId]) {
        delete this.state.endpoints[endpointId];
        delete this.state.presence[endpointId];
        this.scheduleSave();
        return true;
      }
      return false;
    },
  };

  // --- Conversations Collection ---
  public conversations = {
    get: (conversationId: string): Conversation | null =>
      this.state.conversations[conversationId] || null,
    findForUser: (userId: string): Conversation[] => {
      const convIds = this.state.conversation_members
        .filter((m) => m.user_id === userId)
        .map((m) => m.conversation_id);
      return convIds
        .map((id) => this.state.conversations[id])
        .filter((c): c is Conversation => Boolean(c))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    },
    findDirectBetween: (userA: string, userB: string): Conversation | null => {
      const userAConvs = this.state.conversation_members
        .filter((m) => m.user_id === userA)
        .map((m) => m.conversation_id);
      for (const convId of userAConvs) {
        const conv = this.state.conversations[convId];
        if (conv && conv.type === 'direct') {
          const members = this.state.conversation_members.filter((m) => m.conversation_id === convId);
          if (members.length === 2 && members.some((m) => m.user_id === userB)) {
            return conv;
          }
        }
      }
      return null;
    },
    set: (conv: Conversation): void => {
      this.state.conversations[conv.conversation_id] = conv;
      this.scheduleSave();
    },
    list: (): Conversation[] => Object.values(this.state.conversations),
    delete: (conversationId: string): boolean => {
      if (this.state.conversations[conversationId]) {
        delete this.state.conversations[conversationId];
        // Remove associated members
        this.state.conversation_members = this.state.conversation_members.filter(
          (m) => m.conversation_id !== conversationId
        );
        // Remove associated messages and deliveries
        const msgIds = Object.values(this.state.messages)
          .filter((m) => m.conversation_id === conversationId)
          .map((m) => m.message_id);
        for (const mid of msgIds) {
          delete this.state.messages[mid];
          for (const delId of Object.keys(this.state.deliveries)) {
            if (this.state.deliveries[delId].message_id === mid) {
              delete this.state.deliveries[delId];
            }
          }
        }
        this.scheduleSave();
        return true;
      }
      return false;
    },
  };

  // --- Conversation Members Collection ---
  public conversationMembers = {
    add: (member: ConversationMember): void => {
      const exists = this.state.conversation_members.some(
        (m) => m.conversation_id === member.conversation_id && m.user_id === member.user_id
      );
      if (!exists) {
        this.state.conversation_members.push(member);
        this.scheduleSave();
      }
    },
    findByConversationId: (convId: string): ConversationMember[] =>
      this.state.conversation_members.filter((m) => m.conversation_id === convId),
    isMember: (convId: string, userId: string): boolean =>
      this.state.conversation_members.some(
        (m) => m.conversation_id === convId && m.user_id === userId
      ),
    removeByUser: (userId: string): void => {
      this.state.conversation_members = this.state.conversation_members.filter(
        (m) => m.user_id !== userId
      );
      this.scheduleSave();
    },
  };

  // --- Messages Collection ---
  public messages = {
    get: (messageId: string): Message | null => this.state.messages[messageId] || null,
    findByConversationId: (convId: string): Message[] =>
      Object.values(this.state.messages)
        .filter((m) => m.conversation_id === convId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    set: (message: Message): void => {
      this.state.messages[message.message_id] = message;
      // Update conversation timestamp
      if (this.state.conversations[message.conversation_id]) {
        this.state.conversations[message.conversation_id].updated_at = message.created_at;
      }
      this.scheduleSave();
    },
    list: (): Message[] => Object.values(this.state.messages),
  };

  // --- Deliveries Collection ---
  public deliveries = {
    get: (deliveryId: string): Delivery | null => this.state.deliveries[deliveryId] || null,
    findByMessageId: (msgId: string): Delivery[] =>
      Object.values(this.state.deliveries).filter((d) => d.message_id === msgId),
    findByEndpointId: (endpointId: string): Delivery[] =>
      Object.values(this.state.deliveries).filter((d) => d.endpoint_id === endpointId),
    findPendingForEndpoint: (endpointId: string): Delivery[] =>
      Object.values(this.state.deliveries).filter(
        (d) => d.endpoint_id === endpointId && d.status === 'pending'
      ),
    set: (delivery: Delivery): void => {
      this.state.deliveries[delivery.delivery_id] = delivery;
      this.scheduleSave();
    },
    updateStatus: (
      deliveryId: string,
      status: DeliveryStatus,
      extra?: { external_message_id?: string; error?: string }
    ): Delivery | null => {
      const d = this.state.deliveries[deliveryId];
      if (d) {
        d.status = status;
        if (status === 'delivered') {
          d.delivered_at = new Date().toISOString();
        } else if (status === 'read') {
          d.read_at = new Date().toISOString();
        }
        if (extra?.external_message_id) {
          d.external_message_id = extra.external_message_id;
        }
        if (extra?.error) {
          d.error = extra.error;
        }
        this.scheduleSave();
        return d;
      }
      return null;
    },
    list: (): Delivery[] => Object.values(this.state.deliveries),
  };

  // --- Pairing Codes Collection ---
  public pairingCodes = {
    get: (code: string): PairingCode | null => this.state.pairing_codes[code.toUpperCase()] || null,
    list: (): PairingCode[] => Object.values(this.state.pairing_codes),
    set: (pairing: PairingCode): void => {
      this.state.pairing_codes[pairing.code.toUpperCase()] = pairing;
      this.scheduleSave();
    },
    markUsed: (code: string, endpointId: string): boolean => {
      const upper = code.toUpperCase();
      const item = this.state.pairing_codes[upper];
      if (item && !item.used) {
        item.used = true;
        item.used_at = new Date().toISOString();
        item.used_by_endpoint_id = endpointId;
        this.scheduleSave();
        return true;
      }
      return false;
    },
    cleanupExpired: (): number => {
      const now = new Date().getTime();
      let cleaned = 0;
      for (const [code, val] of Object.entries(this.state.pairing_codes)) {
        if (new Date(val.expires_at).getTime() < now) {
          delete this.state.pairing_codes[code];
          cleaned++;
        }
      }
      if (cleaned > 0) this.scheduleSave();
      return cleaned;
    },
    deleteByUser: (userId: string): void => {
      let changed = false;
      for (const [code, val] of Object.entries(this.state.pairing_codes)) {
        if (val.user_id === userId) {
          delete this.state.pairing_codes[code];
          changed = true;
        }
      }
      if (changed) this.scheduleSave();
    },
  };

  // --- Presence Collection ---
  public presence = {
    get: (endpointId: string): Presence | null => this.state.presence[endpointId] || null,
    set: (presence: Presence): void => {
      this.state.presence[presence.endpoint_id] = presence;
      if (this.state.endpoints[presence.endpoint_id]) {
        this.state.endpoints[presence.endpoint_id].status = presence.status;
        this.state.endpoints[presence.endpoint_id].last_seen_at = presence.last_seen_at;
      }
      this.scheduleSave();
    },
    list: (): Presence[] => Object.values(this.state.presence),
  };

  // --- Events Collection (Audit & Diagnostics Log) ---
  public events = {
    add: (event: Omit<SystemEvent, 'id' | 'timestamp'>): SystemEvent => {
      const fullEvent: SystemEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...event,
      };
      this.state.events.unshift(fullEvent);
      // Keep recent 300 events in memory
      if (this.state.events.length > 300) {
        this.state.events = this.state.events.slice(0, 300);
      }
      this.scheduleSave();
      return fullEvent;
    },
    list: (limit = 100): SystemEvent[] => this.state.events.slice(0, limit),
  };

  // Helper for test isolation
  public clearAll(): void {
    this.state = {
      users: {},
      endpoints: {},
      conversations: {},
      conversation_members: [],
      messages: {},
      deliveries: {},
      pairing_codes: {},
      presence: {},
      events: [],
    };
    this.saveToDisk();
  }
}

export const db = new StorageManager();
