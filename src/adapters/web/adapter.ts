/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointAdapter, DeliveryResult } from '../base.js';
import { Delivery, Message, Endpoint, EndpointCapability } from '../../types/index.js';
import { routingEngine } from '../../core/routing.js';
import { PresenceService } from '../../core/presence.js';
import { EventEmitter } from 'events';

class WebEventBus extends EventEmitter {}
export const webEventBus = new WebEventBus();

export class WebAdapter implements EndpointAdapter {
  public readonly type = 'web';
  public readonly capabilities: EndpointCapability[] = [
    'text',
    'image',
    'file',
    'notification',
    'interactive',
  ];

  public async deliver(
    delivery: Delivery,
    message: Message,
    endpoint: Endpoint
  ): Promise<DeliveryResult> {
    // If the web endpoint is marked online, we deliver immediately to the active session
    if (endpoint.status === 'online') {
      PresenceService.touch(endpoint.id);

      // Broadcast to any active SSE / real-time listeners for this user/endpoint
      webEventBus.emit('message', {
        endpoint_id: endpoint.id,
        user_id: endpoint.user_id,
        delivery_id: delivery.delivery_id,
        message,
      });

      return {
        success: true,
        external_message_id: `web_ack_${Date.now()}`,
      };
    }

    // Endpoint is offline
    return {
      success: false,
      error: 'Web endpoint is currently offline',
    };
  }

  public async getStatus(): Promise<{ ready: boolean; details?: Record<string, unknown> }> {
    return {
      ready: true,
      details: {
        active_listeners: webEventBus.listenerCount('message'),
      },
    };
  }
}

export const webAdapter = new WebAdapter();
// Register in routing engine
routingEngine.registerAdapter('web', webAdapter);
