/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from '../database/index.js';
import { PairingCode } from '../types/index.js';

const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous chars like 0, O, 1, I
const CODE_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes for stable testing

export class PairingService {
  /**
   * Generate a one-time cryptographic pairing code for a user
   */
  public static createPairingCode(userId: string): PairingCode {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error(`Cannot create pairing code for non-existent user: ${userId}`);
    }

    // Clean up expired codes first
    db.pairingCodes.cleanupExpired();

    // Generate random 5-character string
    let randomPart = '';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      randomPart += CHARS[bytes[i] % CHARS.length];
    }

    const code = `MH-${randomPart}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MS).toISOString();

    const pairing: PairingCode = {
      code,
      user_id: userId,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      used: false,
    };

    db.pairingCodes.set(pairing);

    db.events.add({
      type: 'PAIRING_CREATED',
      user_id: userId,
      details: {
        code,
        expires_at: expiresAt,
      },
    });

    return pairing;
  }

  /**
   * Verify and consume a pairing code to link an endpoint to the target identity
   */
  public static consumePairingCode(
    rawCode: string,
    endpointId: string
  ): { success: boolean; user_id?: string; error?: string } {
    if (!rawCode) {
      return { success: false, error: 'Код сопряжения не указан.' };
    }

    let code = rawCode.trim().toUpperCase();
    if (!code.startsWith('MH-')) {
      code = code.startsWith('MH') ? `MH-${code.slice(2)}` : `MH-${code}`;
    }

    const pairing = db.pairingCodes.get(code);

    if (!pairing) {
      return { success: false, error: 'Код сопряжения не найден или неверен.' };
    }

    if (pairing.used) {
      return { success: false, error: 'Этот код сопряжения уже был использован.' };
    }

    const now = Date.now();
    const expiry = new Date(pairing.expires_at).getTime();
    if (now > expiry) {
      return { success: false, error: 'Срок действия кода сопряжения истёк. Сгенерируйте новый код в веб-клиенте.' };
    }

    // Mark as used immediately (one-time burn)
    db.pairingCodes.markUsed(code, endpointId);

    db.events.add({
      type: 'PAIRING_COMPLETED',
      user_id: pairing.user_id,
      endpoint_id: endpointId,
      details: {
        code,
      },
    });

    return {
      success: true,
      user_id: pairing.user_id,
    };
  }
}
