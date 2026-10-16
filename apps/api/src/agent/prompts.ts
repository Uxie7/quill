import type { Plan } from './policy';

export const SYSTEM_PROMPT = `You are Quill, an assistant for a practitioner who runs paid one-on-one calls with clients.
After each call you decide the best follow-up. You never send anything: you only draft, and the practitioner approves.
Rules:
- Use only facts from the transcript, the commitments list and tool results. Do not invent promises, dates or details.
- If a commitment is unclear, ask the practitioner. Do not treat it as firm.
- Check earlier calls before judging whether a client is drifting.
- Apply the decision policy exactly.
- Search topics must be general. Never include names or anything that identifies a person.
- Write drafts in a warm, plain tone, under 120 words, signed with the practitioner's name.
- Finish with a one-sentence reason for the chosen next step.`;

export function extractionPrompt(practitioner: string, clientName: string, transcript: string) {
  return `From this call transcript between ${practitioner} (the practitioner) and ${clientName} (the client), list every commitment made.
For each give:
- who: "you" if the practitioner promised it, "client" if the client promised it
- text: a short description of the commitment
- due: when it is due, as spoken (for example "Friday"), or null
- firm: true if stated definitely, false if hedged with words like maybe, might, probably or "I'll try"
- quote: the exact sentence from the transcript
Return JSON only in this shape: {"commitments":[{"who":"client","text":"...","due":"...","firm":true,"quote":"..."}]}
Do not include anything that was not said.

Transcript:
${transcript}`;
}

export interface DraftCtx {
  practitioner: string; clientName: string; gig: string; plan: Plan;
  commitments: { who: string; text: string; due: string | null; status: string }[];
  history: string; resource: { title: string; url: string } | null; today: string;
}

const KIND_GUIDE = {
  checkin: 'Write a warm, low-pressure check-in. Briefly restate what each side promised, offer a quick call, and do not scold.',
  plan: 'Write a short practice or action plan the client can do alone before the next call. Say there is no pressure.',
  recap: 'Write a concise standard recap of what each side promised and when. Keep it light.',
} as const;

export function draftPrompt(c: DraftCtx) {
  const list = c.commitments.map(x => `- ${x.who === 'you' ? c.practitioner : c.clientName}: ${x.text}${x.due ? ` (${x.due})` : ''}${x.status === 'unclear' ? ' [unclear, do not state as firm]' : ''}`).join('\n');
  return `${SYSTEM_PROMPT}

Today: ${c.today}. Practitioner: ${c.practitioner}. Client: ${c.clientName}. Work: ${c.gig}.
Decision: ${c.plan.kind} (${c.plan.headline})
${KIND_GUIDE[c.plan.kind]}
Commitments from this call:
${list || '- none found'}
What earlier calls show: ${c.history}
Attachment: ${c.resource ? `${c.resource.title} (${c.resource.url})` : 'none'}

Return JSON only: {"why":"one sentence reason for the next step","email_subject":"...","email_body":"... signed ${c.practitioner}","reminder_text":"a short note for ${c.practitioner} about what to check on"}`;
}

export function fallbackDraft(c: DraftCtx) {
  const mine = c.commitments.filter(x => x.who === 'you' && x.status !== 'unclear').map(x => `${x.text}${x.due ? ` (${x.due})` : ''}`);
  const theirs = c.commitments.filter(x => x.who === 'client' && x.status !== 'unclear').map(x => `${x.text}${x.due ? ` (${x.due})` : ''}`);
  const intro = { checkin: 'Thanks for the call today. I wanted to check in and see how things are going.', plan: 'Great work today. Here is a short plan for before we next speak.', recap: 'Thanks for the time today. A quick recap.' }[c.plan.kind];
  const lines = [`Hi ${c.clientName},`, '', intro];
  if (theirs.length) lines.push('', `On your side: ${theirs.join('; ')}.`);
  if (mine.length) lines.push(`On mine: ${mine.join('; ')}.`);
  if (c.resource) lines.push('', `This might help: ${c.resource.title} ${c.resource.url}`);
  lines.push('', 'Let me know if anything changes.', '', 'Best,', c.practitioner);
  return {
    why: `${c.plan.headline} (Quill used a standard template because the model did not return a usable draft.)`,
    email_subject: `Following up on our call`,
    email_body: lines.join('\n'),
    reminder_text: `Check in with ${c.clientName} if there is no reply.`,
  };
}
