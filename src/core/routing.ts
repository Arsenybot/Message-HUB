/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from '../database/index.js';
import { Delivery, Endpoint, Message } from '../types/index.js';
import { CapabilityService } from './capability.js';
import { EndpointAdapter } from '../adapters/base.js';

class RoutingEngine {
  private adapters: Map<string, EndpointAdapter> = new Map();

  public registerAdapter(type: string, adapter: EndpointAdapter) {
    this.adapters.set(type, adapter);
  }

  public getAdapter(type: string): EndpointAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Route a message across recipients and their active or offline endpoints.
   */
  public async routeMessage(
    message: Message,
    recipientUserIds: string[]
  ): Promise<Delivery[]> {
    const requiredCaps = CapabilityService.getRequiredCapabilities(message.content_type);
    const createdDeliveries: Delivery[] = [];

    db.events.add({
      type: 'ROUTING_STARTED',
      message_id: message.message_id,
      user_id: message.sender_user_id,
      details: {
        recipients_count: recipientUserIds.length,
        required_capabilities: requiredCaps,
      },
    });

    for (const recipientId of recipientUserIds) {
      const endpoints = db.endpoints.findByUserId(recipientId);

      // Filter endpoints by capabilities
      const capableEndpoints = endpoints.filter((ep) =>
        CapabilityService.supports(ep.capabilities, requiredCaps)
      );

      if (capableEndpoints.length === 0) {
        // Recipient has no matching endpoints currently
        const delivery: Delivery = {
          delivery_id: `delv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          message_id: message.message_id,
          endpoint_id: 'none',
          recipient_user_id: recipientId,
          status: 'failed',
          created_at: new Date().toISOString(),
          error: 'Recipient has no endpoints supporting required capabilities',
        };
        db.deliveries.set(delivery);
        createdDeliveries.push(delivery);
        continue;
      }

      // Fan out delivery to the recipient's capable endpoints
      for (const endpoint of capableEndpoints) {
        const delivery: Delivery = {
          delivery_id: `delv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          message_id: message.message_id,
          endpoint_id: endpoint.id,
          recipient_user_id: recipientId,
          status: 'pending',
          created_at: new Date().toISOString(),
        };

        db.deliveries.set(delivery);
        createdDeliveries.push(delivery);

        // If endpoint is online, attempt immediate delivery
        if (endpoint.status === 'online') {
          await this.executeDelivery(delivery, message, endpoint);
        } else {
          // Endpoint is offline -> remains 'pending' until endpoint connects
          db.events.add({
            type: 'DELIVERY_STARTED',
            delivery_id: delivery.delivery_id,
            message_id: message.message_id,
            endpoint_id: endpoint.id,
            details: {
              note: 'Endpoint is offline, delivery queued as pending',
            },
          });
        }
      }
    }

    return createdDeliveries;
  }

  /**
   * Execute delivery through the appropriate interface adapter
   */
  public async executeDelivery(
    delivery: Delivery,
    message: Message,
    endpoint: Endpoint
  ): Promise<Delivery> {
    const adapter = this.adapters.get(endpoint.type);

    if (!adapter) {
      const err = `No adapter registered for endpoint type: ${endpoint.type}. Known adapters: [${Array.from(this.adapters.keys()).join(', ')}]`;
      db.deliveries.updateStatus(delivery.delivery_id, 'failed', { error: err });
      db.events.add({
        type: 'DELIVERY_FAILED',
        delivery_id: delivery.delivery_id,
        message_id: message.message_id,
        endpoint_id: endpoint.id,
        details: { error: err },
      });
      return delivery;
    }

    db.events.add({
      type: 'DELIVERY_STARTED',
      delivery_id: delivery.delivery_id,
      message_id: message.message_id,
      endpoint_id: endpoint.id,
      details: {
        adapter_type: endpoint.type,
      },
    });

    try {
      const result = await adapter.deliver(delivery, message, endpoint);

      if (result.success) {
        db.deliveries.updateStatus(delivery.delivery_id, 'delivered', {
          external_message_id: result.external_message_id,
        });
        db.events.add({
          type: 'DELIVERY_SUCCESS',
          delivery_id: delivery.delivery_id,
          message_id: message.message_id,
          endpoint_id: endpoint.id,
          details: {
            external_message_id: result.external_message_id,
          },
        });
      } else {
        db.deliveries.updateStatus(delivery.delivery_id, 'failed', {
          error: result.error || 'Delivery failed',
        });
        db.events.add({
          type: 'DELIVERY_FAILED',
          delivery_id: delivery.delivery_id,
          message_id: message.message_id,
          endpoint_id: endpoint.id,
          details: {
            error: result.error,
          },
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      db.deliveries.updateStatus(delivery.delivery_id, 'failed', { error: errorMsg });
      db.events.add({
        type: 'DELIVERY_FAILED',
        delivery_id: delivery.delivery_id,
        message_id: message.message_id,
        endpoint_id: endpoint.id,
        details: { error: errorMsg },
      });
    }

    return db.deliveries.get(delivery.delivery_id) || delivery;
  }

  /**
   * When an endpoint comes online, flush all pending deliveries for it!
   */
  public async flushPendingDeliveries(endpointId: string): Promise<number> {
    const endpoint = db.endpoints.get(endpointId);
    if (!endpoint || endpoint.status !== 'online') {
      return 0;
    }

    const pendingDeliveries = db.deliveries.findPendingForEndpoint(endpointId);
    let deliveredCount = 0;

    for (const delivery of pendingDeliveries) {
      const message = db.messages.get(delivery.message_id);
      if (message) {
        const res = await this.executeDelivery(delivery, message, endpoint);
        if (res.status === 'delivered') {
          deliveredCount++;
        }
      }
    }

    return deliveredCount;
  }
}

export const routingEngine = new RoutingEngine();
