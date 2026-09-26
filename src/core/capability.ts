/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointCapability } from '../types/index.js';

export const STANDARD_CAPABILITIES: Record<string, EndpointCapability[]> = {
  web: ['text', 'image', 'file', 'notification', 'interactive'],
  telegram: ['text', 'image', 'file', 'voice', 'video', 'location', 'interactive'],
  ai: ['text', 'interactive'],
  voice: ['voice'],
};

export class CapabilityService {
  /**
   * Check if an endpoint supports all required capabilities for a message
   */
  public static supports(
    endpointCapabilities: EndpointCapability[],
    required: EndpointCapability[]
  ): boolean {
    if (required.length === 0) return true;
    return required.every((cap) => endpointCapabilities.includes(cap));
  }

  /**
   * Derive required capabilities from message content
   */
  public static getRequiredCapabilities(contentType: string): EndpointCapability[] {
    switch (contentType) {
      case 'image':
        return ['image'];
      case 'file':
        return ['file'];
      case 'voice':
        return ['voice'];
      case 'location':
        return ['location'];
      case 'text':
      default:
        return ['text'];
    }
  }
}
