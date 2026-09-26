/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EndpointType = 'web' | 'telegram' | 'ai' | 'voice' | 'mobile' | 'watch' | 'car';

export type EndpointCapability =
  | 'text'
  | 'image'
  | 'file'
  | 'voice'
  | 'video'
  | 'location'
  | 'notification'
  | 'interactive';

export type EndpointStatus = 'online' | 'offline' | 'unknown';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ConversationType = 'direct' | 'group';

export type UniversalActionType =
  | 'SEND_MESSAGE'
  | 'SEND_FILE'
  | 'SEND_IMAGE'
  | 'MARK_READ'
  | 'CREATE_CONVERSATION'
  | 'LINK_ENDPOINT'
  | 'UNLINK_ENDPOINT';

export interface User {
  user_id: string;
  display_name: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface Endpoint {
  id: string;
  user_id: string;
  type: EndpointType;
  external_id: string; // e.g. Telegram chat_id or Web session ID
  display_name: string;
  status: EndpointStatus;
  capabilities: EndpointCapability[];
  created_at: string;
  last_seen_at: string;
  metadata: {
    bot_id?: 'bot_a' | 'bot_b' | string;
    username?: string;
    first_name?: string;
    last_name?: string;
    user_agent?: string;
    client_ip?: string;
    [key: string]: unknown;
  };
}

export interface Conversation {
  conversation_id: string;
  type: ConversationType;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  joined_at: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'voice';
  url: string;
  name?: string;
  size?: number;
  mime_type?: string;
}

export interface Message {
  message_id: string;
  conversation_id: string;
  sender_user_id: string;
  content_type: 'text' | 'image' | 'file' | 'voice' | 'location';
  text: string;
  attachments?: MessageAttachment[];
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface Delivery {
  delivery_id: string;
  message_id: string;
  endpoint_id: string;
  recipient_user_id: string;
  status: DeliveryStatus;
  external_message_id?: string;
  created_at: string;
  delivered_at?: string;
  read_at?: string;
  error?: string;
}

export interface PairingCode {
  code: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  used_at?: string;
  used_by_endpoint_id?: string;
}

export interface Presence {
  endpoint_id: string;
  status: EndpointStatus;
  last_seen_at: string;
}

export type EventLogType =
  | 'ENDPOINT_CONNECTED'
  | 'ENDPOINT_DISCONNECTED'
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_CREATED'
  | 'ROUTING_STARTED'
  | 'DELIVERY_STARTED'
  | 'DELIVERY_SUCCESS'
  | 'DELIVERY_FAILED'
  | 'PAIRING_CREATED'
  | 'PAIRING_COMPLETED'
  | 'SECURITY_VIOLATION'
  | 'CONVERSATION_DELETED';

export interface SystemEvent {
  id: string;
  type: EventLogType;
  user_id?: string;
  endpoint_id?: string;
  message_id?: string;
  delivery_id?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface BotStatusInfo {
  bot_id: 'bot_a' | 'bot_b';
  configured: boolean;
  username?: string;
  name?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  webhook?: {
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    ip_address?: string;
  };
  error?: string;
}

export interface SystemDiagnostics {
  status: 'healthy' | 'degraded' | 'error';
  app_url: string;
  environment: string;
  active_users: number;
  total_endpoints: number;
  online_endpoints: number;
  total_messages: number;
  total_deliveries: number;
  pending_deliveries: number;
  failed_deliveries: number;
  telegram_bots: {
    bot_a: BotStatusInfo;
    bot_b: BotStatusInfo;
  };
  recent_events: SystemEvent[];
}
