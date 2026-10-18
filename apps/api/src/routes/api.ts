import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { col, newId } from '../db/client';
import { cfg } from '../config';
import { runPipeline } from '../pipeline';
import { buildResult, clientView, commitmentView } from '../results';
import { buildDashboard, reminderView } from '../dashboard';
import { Role } from '../schemas';

const ah = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const SAMPLES: Record<string, string> = { dana: 'dana-06', marcus: 'marcus-06', ines: 'ines-08' };
const upload = multer({ dest: 'data/uploads', limits: { fileSize: 500 * 1024 * 1024 } });

async function startCall(callId: string) {
  if (cfg.useTemporal) {
    const [{ temporal }, { processCall }] = await Promise.all([import('../temporal'), import('../workflows/processCall')]);
    await (await temporal()).workflow.start(processCall, { taskQueue: 'quill', workflowId: `call-${callId}`, args: [callId] });
  } else {
    setImmediate(() => { runPipeline(callId).catch(() => { /* failure is stored on the call */ }); });
  }
}

async function createCall(clientId: string, extra: Record<string, unknown>) {
  const clients = await col('clients');
  if (!(await clients.findOne({ _id: clientId }))) return null;
  const callId = newId();
  await (await col('calls')).insertOne({ _id: callId, clientId, heldAt: new Date(), minutes: 0, status: 'queued', ...extra });
  await startCall(callId);
  return callId;
}

export function liveRoutes(app: Express) {
  app.get('/api/health', (_q, r) => { r.json({ mode: cfg.mode, temporal: cfg.useTemporal }); });

  // Clients
  app.get('/api/clients', ah(async (_q, res) => { res.json((await (await col('clients')).find().sort({ createdAt: 1 }).toArray()).map(clientView)); }));
  app.post('/api/clients', ah(async (req, res) => {
    const role = Role.safeParse(req.body?.role);
    const name = String(req.body?.name ?? '').trim();
    if (!role.success || !name) return fail(res, 400, 'bad_request', 'Add a name and a work type.');
    const doc = { _id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + newId().slice(-4), name, role: role.data, gig: String(req.body?.gig ?? '').slice(0, 120), createdAt: new Date() };
    await (await col('clients')).insertOne(doc);
    res.status(201).json(clientView(doc));
  }));
  app.delete('/api/clients/:id', ah(async (req, res) => {
    const id = String(req.params.id);
    if (['dana', 'marcus', 'ines'].includes(id)) {
      return fail(res, 403, 'forbidden', 'Initial demo clients cannot be deleted.');
    }
    const clients = await col('clients');
    const result = await clients.deleteOne({ _id: id });
    if (result.deletedCount === 0) return fail(res, 404, 'not_found', 'No such client.');
    await (await col('calls')).deleteMany({ clientId: id });
    await (await col('commitments')).deleteMany({ clientId: id });
    await (await col('reminders')).deleteMany({ clientId: id });
    res.json({ ok: true, deletedId: id });
  }));

  // Calls
  app.post('/api/calls', upload.single('audio'), ah(async (req, res) => {
    const clientId = String(req.body?.clientId ?? '');
    if (!req.file || !clientId) return fail(res, 400, 'bad_request', 'Add a file and pick a client.');
    if (!/\.(m4a|mp3|wav|mp4|webm|ogg)$/i.test(req.file.originalname)) return fail(res, 415, 'unsupported_media', 'Use an audio or video file.');
    const callId = await createCall(clientId, { audioPath: req.file.path, originalName: req.file.originalname });
    if (!callId) return fail(res, 404, 'not_found', 'No such client.');
    res.status(201).json({ callId });
  }));

  app.post('/api/calls/sample', ah(async (req, res) => {
    const clientKey = String(req.body?.clientKey ?? '');
    const scriptId = SAMPLES[clientKey];
    if (!scriptId) return fail(res, 400, 'bad_request', 'No sample call for this client.');
    const script = JSON.parse(fs.readFileSync(`data/scripts/${scriptId}.json`, 'utf8'));
    const audio = `data/audio/${scriptId}.mp3`;
    const extra = fs.existsSync(audio) && cfg.whisperModel ? { audioPath: audio } : { sourceText: script.lines.map((l: any) => l.text).join(' ') };
    const callId = await createCall(clientKey, extra);
    if (!callId) return fail(res, 404, 'not_found', 'Run `npm run seed` first.');
    res.status(201).json({ callId });
  }));

  // Dev only: process a transcript directly (used by the eval script)
  app.post('/api/dev/calls/from-text', ah(async (req, res) => {
    if (process.env.NODE_ENV === 'production') return fail(res, 404, 'not_found', 'Not found.');
    const text = String(req.body?.text ?? '');
    if (!text || !req.body?.clientId) return fail(res, 400, 'bad_request', 'Send clientId and text.');
    const callId = await createCall(String(req.body.clientId), { sourceText: text });
    if (!callId) return fail(res, 404, 'not_found', 'No such client.');
    res.status(201).json({ callId });
  }));

  app.get('/api/calls/:id', ah(async (req, res) => {
    const call = await (await col('calls')).findOne({ _id: req.params.id });
    if (!call) return fail(res, 404, 'not_found', 'No such call.');
    const steps = await (await col('steps')).find({ callId: call._id }).sort({ idx: 1 }).toArray();
    res.json({ id: call._id, clientId: call.clientId, status: call.status, startedAt: call.heldAt, error: call.error, steps: steps.map(s => ({ id: s.stepId, title: s.title, tech: s.tech, result: s.result, ms: s.ms, egress: s.egress })) });
  }));

  // Live step stream. Reads the steps collection, because the worker may be a different process.
  app.get('/api/calls/:id/stream', ah(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    let sent = 0, closed = false;
    req.on('close', () => { closed = true; });
    const calls = await col('calls'), steps = await col('steps');
    const deadline = Date.now() + 15 * 60_000;
    while (!closed && Date.now() < deadline) {
      const fresh = await steps.find({ callId: req.params.id }).sort({ idx: 1 }).skip(sent).toArray();
      for (const s of fresh) {
        res.write(`event: step\ndata: ${JSON.stringify({ id: s.stepId, title: s.title, tech: s.tech, result: s.result, ms: s.ms, egress: s.egress })}\n\n`);
        sent++;
      }
      const call = await calls.findOne({ _id: req.params.id });
      if (!call) { res.write(`event: error\ndata: ${JSON.stringify({ message: 'No such call.' })}\n\n`); break; }
      if (call.status === 'failed') { res.write(`event: error\ndata: ${JSON.stringify({ message: call.error ?? 'Processing failed.' })}\n\n`); break; }
      if (['awaiting_approval', 'done'].includes(call.status) && fresh.length === 0) { res.write('event: done\ndata: {}\n\n'); break; }
      await new Promise(r => setTimeout(r, 400));
    }
    res.end();
  }));

  app.get('/api/calls/:id/results', ah(async (req, res) => {
    const r = await buildResult(req.params.id);
    if (!r) return fail(res, 404, 'not_found', 'No such call.');
    if (!['awaiting_approval', 'done'].includes(r.status)) return fail(res, 409, 'not_ready', 'Still processing.');
    res.json(r);
  }));

  // Actions
  app.post('/api/actions/:id/approve', ah(async (req, res) => {
    const actions = await col('actions');
    const act = await actions.findOne({ _id: req.params.id });
    if (!act) return fail(res, 404, 'not_found', 'No such action.');
    const body = String(req.body?.body ?? act.body);
    const mailto = act.kind === 'email' ? `mailto:?subject=${encodeURIComponent(act.subject ?? '')}&body=${encodeURIComponent(body)}` : undefined;
    if (act.state === 'approved') return res.json({ state: 'approved', mailto }); // idempotent
    await actions.updateOne({ _id: act._id }, { $set: { state: 'approved', body } });
    if (act.kind === 'reminder') {
      const reminderId = newId();
      await (await col('reminders')).insertOne({ _id: reminderId, actionId: act._id, clientId: act.clientId, text: body, remindAt: act.remindAt, state: 'scheduled' });
      if (cfg.useTemporal) {
        const [{ temporal }, { reminderWorkflow }] = await Promise.all([import('../temporal'), import('../workflows/processCall')]);
        try { await (await temporal()).workflow.start(reminderWorkflow, { taskQueue: 'quill', workflowId: `reminder-${act._id}`, args: [reminderId, new Date(act.remindAt).getTime()] }); }
        catch (e: any) { if (e?.name !== 'WorkflowExecutionAlreadyStartedError') throw e; }
      }
    }
    if (cfg.useTemporal) {
      try { const { temporal } = await import('../temporal'); const { actionDecided } = await import('../workflows/processCall'); await (await temporal()).workflow.getHandle(`call-${act.callId}`).signal(actionDecided, String(act._id)); } catch { /* workflow may have finished */ }
    }
    res.json({ state: 'approved', mailto });
  }));

  app.post('/api/actions/:id/dismiss', ah(async (req, res) => {
    const r = await (await col('actions')).findOneAndUpdate({ _id: req.params.id, state: 'pending' }, { $set: { state: 'dismissed' } }, { returnDocument: 'after' });
    if (r && cfg.useTemporal) {
      try { const { temporal } = await import('../temporal'); const { actionDecided } = await import('../workflows/processCall'); await (await temporal()).workflow.getHandle(`call-${r.callId}`).signal(actionDecided, String(r._id)); } catch { /* ignore */ }
    }
    res.json({ state: 'dismissed' });
  }));

  // Commitments
  app.post('/api/commitments/:id/answer', ah(async (req, res) => {
    const c = await (await col('commitments')).findOneAndUpdate({ _id: req.params.id }, { $set: { status: req.body?.track ? 'open' : 'dismissed' } }, { returnDocument: 'after' });
    if (!c) return fail(res, 404, 'not_found', 'No such promise.');
    res.json(commitmentView(c));
  }));
  app.patch('/api/commitments/:id', ah(async (req, res) => {
    const set: Record<string, unknown> = {};
    if (req.body?.status === 'done') { set.status = 'done'; set.doneAt = new Date(); }
    if (req.body?.status === 'open') set.status = 'open';
    if (req.body?.who === 'you' || req.body?.who === 'client') set.who = req.body.who;
    const c = await (await col('commitments')).findOneAndUpdate({ _id: req.params.id }, { $set: set }, { returnDocument: 'after' });
    if (!c) return fail(res, 404, 'not_found', 'No such promise.');
    res.json(commitmentView(c));
  }));

  // Dashboard, reminders, privacy
  app.get('/api/dashboard', ah(async (_q, res) => { res.json(await buildDashboard()); }));
  app.get('/api/reminders', ah(async (_q, res) => { res.json((await (await col('reminders')).find({ state: { $ne: 'done' } }).sort({ remindAt: 1 }).toArray()).map(r => reminderView(r))); }));
  app.post('/api/reminders', ah(async (req, res) => {
    const when = new Date(req.body?.remindAt);
    if (!req.body?.text || !req.body?.clientId || isNaN(when.getTime())) return fail(res, 400, 'bad_request', 'Add text, a client and a time.');
    const doc = { _id: newId(), clientId: String(req.body.clientId), text: String(req.body.text), remindAt: when, state: 'scheduled' };
    await (await col('reminders')).insertOne(doc);
    res.status(201).json(reminderView(doc));
  }));
  app.get('/api/egress', ah(async (_q, res) => {
    const rows = await (await col('egress')).find().sort({ at: -1 }).limit(50).toArray();
    res.json(rows.map(r => ({ id: r._id, callId: r.callId, to: r.to, contents: r.contents, reason: r.reason, at: r.at })));
  }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    fail(res, err?.message?.includes('not reachable') ? 503 : 500, err?.message?.includes('not reachable') ? 'model_unavailable' : 'internal', err?.message ?? 'Something went wrong.');
  });
}
