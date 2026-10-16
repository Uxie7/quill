import { z } from 'zod';

export const Role = z.enum(['freelancer', 'consultant', 'coach']);
export const Who = z.enum(['you', 'client']);
export const CallStatus = z.enum(['queued', 'transcribing', 'analyzing', 'awaiting_approval', 'done', 'failed']);
// 'overdue' is computed at read time and never stored
export const CommitmentStatus = z.enum(['open', 'done', 'unclear', 'dismissed']);
export const StepId = z.enum(['transcribe', 'extract', 'history', 'risk', 'decide', 'resource', 'draft']);

export const ExtractionOutput = z.object({
  commitments: z.array(z.object({
    who: Who,
    text: z.string().min(3),
    due: z.string().nullable().optional().transform(v => v ?? null),
    firm: z.boolean(),
    quote: z.string().min(5),
  })),
});

export const DraftJson = z.object({
  why: z.string().min(5).max(400),
  email_subject: z.string().min(2).max(160),
  email_body: z.string().min(20),
  reminder_text: z.string().min(3).max(200),
});

export const RiskFeatures = z.object({
  calls_so_far: z.number().int().nonnegative(),
  avg_gap_days: z.number().nonnegative(),
  last_gap_days: z.number().nonnegative(),
  missed_count: z.number().int().nonnegative(),
  avg_reply_hours: z.number().nonnegative(),
  days_since_last_call: z.number().nonnegative(),
});
export type RiskFeaturesT = z.infer<typeof RiskFeatures>;

export const AgentOutput = z.object({
  why: z.string().max(400),
  drafts: z.array(z.object({
    kind: z.enum(['email', 'reminder']),
    subject: z.string().optional(),
    body: z.string(),
    remindAt: z.string().optional(),
  })).min(1).max(3),
  questions: z.array(z.object({ commitmentId: z.string(), text: z.string() })),
});

export type RoleT = z.infer<typeof Role>;
