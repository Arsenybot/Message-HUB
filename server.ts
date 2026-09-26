/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/api/routes.js';
import { telegramRegistry } from './src/adapters/telegram/registry.js';
import { telegramPoller } from './src/adapters/telegram/poller.js';
import { initializeAdapters } from './src/adapters/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(express.json());

  // Mount API router
  app.use('/api', apiRouter);

  // Catch-all for API routes to NEVER fall through to HTML/Vite SPA fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });

  // API error handler
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
  });

  // Initialize adapters & Telegram bots
  initializeAdapters();
  telegramRegistry.init();
  telegramPoller.start();

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Message Hub Core] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Message Hub Core] Mode: ${isDev ? 'Development' : 'Production'}`);
    console.log(`[Message Hub Core] App URL: ${process.env.APP_URL || 'Not specified'}`);
  });
}

startServer().catch((err) => {
  console.error('[Message Hub] Fatal startup error:', err);
  process.exit(1);
});
