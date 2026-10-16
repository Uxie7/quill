import express from 'express';
import path from 'node:path';
import { cfg } from './config';
import { initSentry } from './sentry';

initSentry();
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.resolve('apps/web/public')));

if (cfg.mode === 'replay') {
  (await import('./replay/routes')).replayRoutes(app);
} else {
  (await import('./routes/api')).liveRoutes(app);
}

app.listen(cfg.port, () => console.log(`Quill (${cfg.mode} mode) on http://localhost:${cfg.port}`));
