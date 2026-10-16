// Replay mode: serves recorded runs from data/replay/*.json. No database, model or Temporal needed.
import type { Express } from 'express';
import fs from 'node:fs';

const read = (name: string) => JSON.parse(fs.readFileSync(`data/replay/${name}.json`, 'utf8'));
const state = new Map<string, string>(); // approve / dismiss state kept in memory for the session

export function replayRoutes(app: Express) {
  app.get('/api/health', (_q, r) => { r.json({ mode: 'replay', temporal: false }); });
  app.get('/api/clients', (_q, r) => { r.json(read('_clients')); });
  app.get('/api/dashboard', (_q, r) => { r.json(read('_dashboard')); });
  app.get('/api/reminders', (_q, r) => { r.json(read('_dashboard').reminders); });
  app.get('/api/egress', (_q, r) => { r.json(read('_egress')); });

  const start = (key: string) => `replay-${key}-${Date.now()}`;
  app.post('/api/calls', (req, res) => { res.status(201).json({ callId: start(String(req.body?.clientId ?? 'dana')) }); });
  app.post('/api/calls/sample', (req, res) => { res.status(201).json({ callId: start(String(req.body?.clientKey ?? 'dana')) }); });

  app.get('/api/calls/:id/stream', async (req, res) => {
    const key = req.params.id.split('-')[1];
    let run: any;
    try { run = read(key); } catch { res.status(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    let closed = false;
    req.on('close', () => { closed = true; });
    for (const s of run.steps) {
      await new Promise(r => setTimeout(r, Math.min(1100, Math.max(350, s.ms))));
      if (closed) return;
      res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`);
    }
    res.write('event: done\ndata: {}\n\n');
    res.end();
  });
  app.get('/api/calls/:id/results', (req, res) => {
    try {
      const r = read(req.params.id.split('-')[1]).result;
      const remindAt = new Date(Date.now() + (r.reminderDays ?? 2) * 86_400_000); remindAt.setHours(9, 0, 0, 0);
      res.json({ ...r, callId: req.params.id, drafts: r.drafts.map((d: any) => d.kind === 'reminder' ? { ...d, remindAt } : d) });
    } catch { res.status(404).json({ error: { code: 'not_found', message: 'No recorded run for this client.' } }); }
  });
  app.post('/api/actions/:id/approve', (req, res) => {
    state.set(req.params.id, 'approved');
    const body = String(req.body?.body ?? '');
    res.json({ state: 'approved', mailto: req.params.id.endsWith('-email') ? `mailto:?subject=Following%20up%20on%20our%20call&body=${encodeURIComponent(body)}` : undefined });
  });
  app.post('/api/actions/:id/dismiss', (req, res) => { state.set(req.params.id, 'dismissed'); res.json({ state: 'dismissed' }); });
  app.post('/api/commitments/:id/answer', (req, res) => { res.json({ id: req.params.id, status: req.body?.track ? 'open' : 'dismissed' }); });
  app.patch('/api/commitments/:id', (req, res) => { res.json({ id: req.params.id, ...req.body }); });
  app.post('/api/reminders', (req, res) => { res.status(201).json({ id: `r-${Date.now()}`, ...req.body, state: 'scheduled' }); });
}
