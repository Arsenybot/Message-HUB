/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Delivery, Message, Endpoint, EndpointCapability } from '../types/index.js';

export interface DeliveryResult {
  success: boolean;
  external_message_id?: string;
  error?: string;
}

export interface EndpointAdapter {
  readonly type: string;
  readonly capabilities: EndpointCapability[];

  /**
   * Deliver a Message Hub message to the concrete endpoint interface
   */
  deliver(delivery: Delivery, message: Message, endpoint: Endpoint): Promise<DeliveryResult>;

  /**
   * Check connection / health status
   */
  getStatus(): Promise<{ ready: boolean; details?: Record<string, unknown> }>;
}
