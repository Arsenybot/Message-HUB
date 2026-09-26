/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { routingEngine } from '../core/routing.js';
import { telegramAdapter } from './telegram/adapter.js';
import { webAdapter } from './web/adapter.js';

export function initializeAdapters() {
  routingEngine.registerAdapter('telegram', telegramAdapter);
  routingEngine.registerAdapter('web', webAdapter);
}

// Auto-initialize
initializeAdapters();

export { telegramAdapter, webAdapter };
