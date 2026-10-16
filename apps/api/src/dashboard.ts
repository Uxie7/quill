import { col } from './db/client';
import { decide } from './agent/policy';
import { commitmentView, clientView } from './results';

export const reminderView = (r: any, now = new Date()) => {
  const { _id, ...rest } = r;
  return { id: _id, ...rest, state: r.state === 'scheduled' && new Date(r.remindAt) <= now ? 'due' : r.state };
};

export async function buildDashboard() {
  const now = new Date();
  const clients = await (await col('clients')).find().sort({ createdAt: 1 }).toArray();
  const names = Object.fromEntries(clients.map(c => [c._id, c.name]));
  const open: Record<string, any>[] = (await (await col('commitments')).find({ status: 'open' }).toArray()).map(c => ({ ...commitmentView(c, now), clientName: names[c.clientId] }));
  const overdue = open.filter(c => c.status === 'overdue');
  const reminders: Record<string, any>[] = (await (await col('reminders')).find({ state: { $ne: 'done' } }).sort({ remindAt: 1 }).toArray()).map(r => ({ ...reminderView(r, now), clientName: names[r.clientId] }));
  const needs = [...overdue, ...open.filter(c => c.status === 'open')].slice(0, 6);
  const glance = [];
  for (const c of clients) {
    const calls = await (await col('calls')).find({ clientId: c._id, status: { $ne: 'queued' } }).sort({ heldAt: -1 }).toArray();
    const withRisk = calls.find(x => typeof x.risk === 'number');
    const plan = decide(withRisk ? withRisk.risk : null);
    glance.push({
      clientId: c._id, name: c.name, role: c.role, lastCallAt: calls[0]?.heldAt ?? null,
      openPromises: open.filter(o => o.clientId === c._id).length,
      status: plan.level === 'high' ? 'attention' : plan.level === 'mid' ? 'watch' : 'ok', statusLabel: plan.label,
    });
  }
  return {
    counts: { open: open.length, overdue: overdue.length, reminders: reminders.length, invoices: open.filter(o => o.who === 'you' && /invoice/i.test(o.text)).length },
    needs, reminders, clients: glance,
  };
}
export { clientView };
