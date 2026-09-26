/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../database/index.js';
import { EndpointStatus, Presence } from '../types/index.js';

export class PresenceService {
  /**
   * Update presence for a specific endpoint.
   * Notice: Presence belongs to an ENDPOINT, NOT to a human!
   * A user can have Web=offline and Telegram=online simultaneously.
   */
  public static setPresence(endpointId: string, status: EndpointStatus): Presence {
    const now = new Date().toISOString();
    const presence: Presence = {
      endpoint_id: endpointId,
      status,
      last_seen_at: now,
    };

    db.presence.set(presence);
    db.endpoints.updateStatus(endpointId, status);

    db.events.add({
      type: status === 'online' ? 'ENDPOINT_CONNECTED' : 'ENDPOINT_DISCONNECTED',
      endpoint_id: endpointId,
      details: {
        status,
        last_seen_at: now,
      },
    });

    return presence;
  }

  public static getPresence(endpointId: string): Presence | null {
    return db.presence.get(endpointId);
  }

  public static touch(endpointId: string): void {
    const existing = db.presence.get(endpointId);
    const now = new Date().toISOString();
    if (existing) {
      existing.last_seen_at = now;
      existing.status = 'online';
      db.presence.set(existing);
    } else {
      this.setPresence(endpointId, 'online');
    }
  }
}
