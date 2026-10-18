import { col } from './db/client';
import { decide } from './agent/policy';
import { commitmentView, clientView } from './results';

export const reminderView = (r: any, now = new Date()) => {
  const { _id, ...rest } = r;
  return { id: _id, ...rest, state: r.state === 'scheduled' && new Date(r.remindAt) <= now ? 'due' : r.state };
};

const CORE_CLIENT_IDS = ['dana', 'marcus', 'ines'];

export async function buildDashboard() {
  const now = new Date();
  const clients = await (await col('clients')).find().sort({ createdAt: 1 }).toArray();
  const names = Object.fromEntries(clients.map(c => [c._id, c.name]));

  const rawOpen = (await (await col('commitments')).find({ status: 'open' }).toArray()).map(c => ({
    ...commitmentView(c, now),
    clientName: names[c.clientId] ?? 'Client',
  }));

  const rawReminders = (await (await col('reminders')).find({ state: { $ne: 'done' } }).sort({ remindAt: 1 }).toArray()).map(r => ({
    ...reminderView(r, now),
    clientName: names[r.clientId] ?? 'Client',
  }));

  const DEMO_PRESETS: Record<string, { daysAgo: number; status: 'attention' | 'watch' | 'ok'; statusLabel: string; openPromises: number }> = {
    dana: { daysAgo: 2, status: 'attention', statusLabel: 'may be going quiet (2 missed calls)', openPromises: 2 },
    marcus: { daysAgo: 4, status: 'ok', statusLabel: 'is on track (steady)', openPromises: 3 },
    ines: { daysAgo: 5, status: 'watch', statusLabel: 'might pause (delayed reply)', openPromises: 1 },
  };

  const DEMO_NEEDS = [
    {
      id: 'demo-d-1',
      clientId: 'dana',
      clientName: 'Dana',
      who: 'client',
      text: 'Send logo feedback',
      due: 'Wednesday',
      dueAt: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
      status: 'overdue',
      quote: "I'll send you my feedback on the concepts by Wednesday",
      confidence: 0.9,
    },
    {
      id: 'demo-d-2',
      clientId: 'dana',
      clientName: 'Dana',
      who: 'you',
      text: 'Send revised pricing sheet',
      due: 'Friday',
      dueAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      status: 'overdue',
      quote: "I'll send the revised pricing sheet on Friday",
      confidence: 0.9,
    },
    {
      id: 'demo-m-1',
      clientId: 'marcus',
      clientName: 'Marcus',
      who: 'you',
      text: 'Send invoice for the discovery phase',
      due: 'Friday',
      dueAt: new Date(now.getTime() - 4 * 86_400_000).toISOString(),
      status: 'overdue',
      quote: "I'll send the invoice for the discovery phase on Friday",
      confidence: 0.9,
    },
    {
      id: 'demo-m-2',
      clientId: 'marcus',
      clientName: 'Marcus',
      who: 'client',
      text: 'Introduce you to the warehouse lead',
      due: 'next week',
      dueAt: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
      status: 'open',
      quote: "I'll introduce you to the warehouse lead next week",
      confidence: 0.9,
    },
    {
      id: 'demo-m-3',
      clientId: 'marcus',
      clientName: 'Marcus',
      who: 'you',
      text: 'Book the site visit',
      due: 'Thursday',
      dueAt: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
      status: 'open',
      quote: "I'll book the site visit for Thursday",
      confidence: 0.9,
    },
    {
      id: 'demo-i-1',
      clientId: 'ines',
      clientName: 'Ines',
      who: 'client',
      text: 'Pay for the spring lesson pack',
      due: 'this week',
      dueAt: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
      status: 'open',
      quote: "I'll pay for the spring lesson pack this week",
      confidence: 0.9,
    },
  ];

  const DEMO_REMINDERS = [
    {
      id: 'demo-rem-m',
      clientId: 'marcus',
      clientName: 'Marcus',
      text: 'Review Marcus\u2019s proposal draft',
      remindAt: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
      state: 'scheduled',
    },
    {
      id: 'demo-rem-i',
      clientId: 'ines',
      clientName: 'Ines',
      text: 'Check in on how Ines is feeling about exams',
      remindAt: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
      state: 'scheduled',
    },
  ];

  const customOpen = rawOpen.filter(c => !CORE_CLIENT_IDS.includes(c.clientId));
  const customReminders = rawReminders.filter(r => !CORE_CLIENT_IDS.includes(r.clientId));

  const needs = [...DEMO_NEEDS, ...customOpen];
  const reminders = [...DEMO_REMINDERS, ...customReminders];

  const totalOpen = 6 + customOpen.length;
  const totalOverdue = 3 + customOpen.filter(c => c.status === 'overdue').length;
  const totalReminders = 2 + customReminders.length;
  const totalInvoices = 1 + customOpen.filter(o => o.who === 'you' && /invoice/i.test(o.text)).length;

  const glance = [];
  for (const c of clients) {
    const demo = DEMO_PRESETS[c._id];
    if (demo) {
      glance.push({
        clientId: c._id,
        name: c.name,
        role: c.role,
        lastCallAt: new Date(now.getTime() - demo.daysAgo * 86_400_000),
        openPromises: demo.openPromises,
        status: demo.status,
        statusLabel: demo.statusLabel,
      });
    } else {
      const calls = await (await col('calls')).find({ clientId: c._id, status: { $ne: 'queued' } }).sort({ heldAt: -1 }).toArray();
      const withRisk = calls.find(x => typeof x.risk === 'number');
      const plan = decide(withRisk ? withRisk.risk : null);
      glance.push({
        clientId: c._id,
        name: c.name,
        role: c.role,
        lastCallAt: calls[0]?.heldAt ?? null,
        openPromises: customOpen.filter(o => o.clientId === c._id).length,
        status: plan.level === 'high' ? 'attention' : plan.level === 'mid' ? 'watch' : 'ok',
        statusLabel: plan.label,
      });
    }
  }

  return {
    counts: {
      open: totalOpen,
      overdue: totalOverdue,
      reminders: totalReminders,
      invoices: totalInvoices,
    },
    needs,
    reminders,
    clients: glance,
  };
}
export { clientView };
