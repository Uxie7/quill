import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDue, isOverdue, quoteInTranscript } from '../src/dates';
import { gateSearch, gateFeatures, forbiddenTerms } from '../src/egress/gate';
import { decide } from '../src/agent/policy';
import { score } from '../src/eval/score';
import { heuristicRisk } from '../src/tools/risk';
import { chunkWords } from '../src/activities/embed';
import { chatJson } from '../src/llm';
import { ExtractionOutput } from '../src/schemas';

describe('resolveDue', () => {
  const held = new Date('2026-10-14T15:00:00Z'); // a Wednesday
  it('Friday is the next Friday', () => expect(resolveDue('Friday', held)?.getDay()).toBe(5));
  it('same weekday means next week, not today', () => { const d = resolveDue('Wednesday', held)!; expect(Math.round((+d - +held) / 864e5)).toBe(7); });
  it('tomorrow', () => expect(Math.round((+resolveDue('tomorrow', held)! - +held) / 864e5)).toBe(1));
  it('next week lands on a Monday', () => expect(resolveDue('next week', held)?.getDay()).toBe(1));
  it('unknown text gives no date', () => expect(resolveDue('whenever', held)).toBeUndefined());
  it('null gives no date', () => expect(resolveDue(null, held)).toBeUndefined());
});

describe('overdue is computed, not stored', () => {
  const now = new Date('2026-10-16T00:00:00Z');
  it('open and past due is overdue', () => expect(isOverdue({ status: 'open', dueAt: new Date('2026-10-10') }, now)).toBe(true));
  it('done is never overdue', () => expect(isOverdue({ status: 'done', dueAt: new Date('2026-10-10') }, now)).toBe(false));
  it('future is not overdue', () => expect(isOverdue({ status: 'open', dueAt: new Date('2026-10-20') }, now)).toBe(false));
  it('no date is not overdue', () => expect(isOverdue({ status: 'open' }, now)).toBe(false));
});

describe('quote check', () => {
  const t = "Hi Alex. I'll get you the brand guidelines by Friday, okay?";
  it('accepts a real quote ignoring punctuation and case', () => expect(quoteInTranscript("I'll get you the brand guidelines by friday", t)).toBe(true));
  it('rejects an invented quote', () => expect(quoteInTranscript('I will pay you double', t)).toBe(false));
});

describe('redaction gate', () => {
  const forbidden = forbiddenTerms('Dana', 'Alex', 'Hi Dana. Thanks Alex. We talked about Northfield yesterday.');
  it('allows a general topic', () => expect(() => gateSearch('client feedback checklist for designers', forbidden)).not.toThrow());
  it('blocks a client name', () => expect(() => gateSearch('feedback checklist for Dana designs', forbidden)).toThrow());
  it('blocks a proper noun from the transcript', () => expect(() => gateSearch('northfield branding checklist for cafes', forbidden)).toThrow());
  it('blocks too short or too long', () => { expect(() => gateSearch('checklist', [])).toThrow(); expect(() => gateSearch('a b c d e f g h i', [])).toThrow(); });
  it('blocks emails and long numbers', () => { expect(() => gateSearch('contact me at a@b.com now please', [])).toThrow(); expect(() => gateSearch('invoice number 123456 payment terms', [])).toThrow(); });
  it('features: numbers only, nothing extra', () => {
    const ok = { calls_so_far: 4, avg_gap_days: 9.5, last_gap_days: 16, missed_count: 2, avg_reply_hours: 20, days_since_last_call: 16 };
    expect(() => gateFeatures(ok)).not.toThrow();
    expect(() => gateFeatures({ ...ok, name: 'Dana' })).toThrow();
    expect(() => gateFeatures({ ...ok, missed_count: 'two' })).toThrow();
  });
});

describe('decision policy', () => {
  it('high', () => expect(decide(0.68).kind).toBe('checkin'));
  it('boundary 0.6 is high', () => expect(decide(0.6).kind).toBe('checkin'));
  it('mid', () => expect(decide(0.41).kind).toBe('plan'));
  it('low', () => expect(decide(0.12).kind).toBe('recap'));
  it('unknown risk is treated as low', () => expect(decide(null).kind).toBe('recap'));
});

describe('local risk formula matches the three sample clients', () => {
  it('Dana is high', () => expect(heuristicRisk({ calls_so_far: 4, avg_gap_days: 9.5, last_gap_days: 16, missed_count: 2, avg_reply_hours: 20, days_since_last_call: 16 })).toBeGreaterThanOrEqual(0.6));
  it('Marcus is low', () => expect(heuristicRisk({ calls_so_far: 6, avg_gap_days: 7, last_gap_days: 7, missed_count: 0, avg_reply_hours: 5, days_since_last_call: 6 })).toBeLessThan(0.3));
  it('Ines is moderate', () => { const r = heuristicRisk({ calls_so_far: 7, avg_gap_days: 7.25, last_gap_days: 9, missed_count: 1, avg_reply_hours: 10.5, days_since_last_call: 9 }); expect(r).toBeGreaterThanOrEqual(0.3); expect(r).toBeLessThan(0.6); });
});

describe('eval scoring', () => {
  const truth = [
    { who: 'client', text: 'send brand guidelines', due: 'Friday', firm: true },
    { who: 'client', text: 'approve the logo', due: 'next week', firm: false },
  ];
  it('perfect extraction', () => {
    const s = score(truth, [{ who: 'client', text: 'Send brand guidelines', status: 'open' }, { who: 'client', text: 'Approve the logo', status: 'unclear' }]);
    expect(s.recall).toBe(1); expect(s.precision).toBe(1); expect(s.speaker).toBe(1); expect(s.ambiguity).toBe(1);
  });
  it('wrong speaker and a missed hedge', () => {
    const s = score(truth, [{ who: 'you', text: 'send brand guidelines', status: 'open' }, { who: 'client', text: 'approve the logo', status: 'open' }]);
    expect(s.speaker).toBe(0.5); expect(s.ambiguity).toBe(0);
  });
  it('extra invented item lowers precision', () => {
    const s = score(truth, [{ who: 'client', text: 'send brand guidelines', status: 'open' }, { who: 'you', text: 'buy a new laptop', status: 'open' }]);
    expect(s.precision).toBe(0.5); expect(s.extra).toBe(1);
  });
});

describe('chunking', () => {
  it('splits long text with overlap and keeps start offsets', () => {
    const text = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ');
    const c = chunkWords(text);
    expect(c.length).toBe(3); expect(c[1].start).toBe(170); expect(c[1].text.split(' ')[0]).toBe('w140');
  });
});

describe('chatJson retries invalid model output', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('recovers on the second try and strips think tags', async () => {
    const replies = ['not json at all', '<think>hmm</think>{"commitments":[{"who":"client","text":"send guidelines","due":"Friday","firm":true,"quote":"by Friday for sure"}]}'];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: replies.shift() } }) })));
    const out = await chatJson([{ role: 'user', content: 'x' }], ExtractionOutput);
    expect(out.commitments[0].who).toBe('client');
  });
  it('gives up with a clear error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: 'nope' } }) })));
    await expect(chatJson([{ role: 'user', content: 'x' }], ExtractionOutput, 2)).rejects.toThrow(/valid JSON/);
  });
  it('reports an unreachable model plainly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(chatJson([{ role: 'user', content: 'x' }], ExtractionOutput)).rejects.toThrow(/not reachable/);
  });
});

describe('privacy: no outbound calls outside the egress wrapper', () => {
  const ALLOWED = new Set(['llm.ts', 'egress/wrapper.ts', 'tools/risk.ts']); // llm.ts and risk.ts talk to localhost only
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  it('fetch( appears only in allowed files', () => {
    const root = path.resolve('apps/api/src');
    const offenders = walk(root).filter(f => f.endsWith('.ts')).filter(f => /\bfetch\(/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(root, f).replace(/\\/g, '/')).filter(f => !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });
  it('risk.ts only calls the configured local service directly', () => {
    const src = fs.readFileSync('apps/api/src/tools/risk.ts', 'utf8');
    const calls = src.match(/fetch\(([^,]+),/g) ?? [];
    expect(calls.every(c => c.includes('cfg.tabpfnUrl'))).toBe(true);
  });
});

describe('replay fixtures', () => {
  for (const [key, script] of [['dana', 'dana-06'], ['marcus', 'marcus-06'], ['ines', 'ines-08']]) {
    it(`${key}: quotes are real and every step is present`, () => {
      const run = JSON.parse(fs.readFileSync(`data/replay/${key}.json`, 'utf8'));
      const text = JSON.parse(fs.readFileSync(`data/scripts/${script}.json`, 'utf8')).lines.map((l: any) => l.text).join(' ');
      expect(run.steps.map((s: any) => s.id)).toEqual(['transcribe', 'extract', 'history', 'risk', 'decide', 'resource', 'draft']);
      for (const c of run.result.commitments) expect(quoteInTranscript(c.quote, text)).toBe(true);
      expect(run.result.drafts.length).toBe(2);
    });
  }
});
