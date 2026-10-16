# 01. Product and scope

## Problem

Solo service providers lose clients and money in the gap after a call: forgotten promises, late follow-ups, and a client quietly drifting away that nobody noticed. The admin is small each time but constant, and the people doing it are also the people delivering the work.

## Users

| User | Example | What they promise and track | Typical risk signal |
|---|---|---|---|
| Freelancer | Brand designer with client "Dana" | Deliverables, invoices | Client keeps delaying a decision, misses calls |
| Consultant | Operations consultant with client "Marcus" | Data requests, outlines, scope changes | Possible second phase (opportunity, not risk) |
| Coach or tutor | Tennis coach with student "Ines" | Practice plans, drills, bookings | Student mentions skipping lessons |

All three are sample clients in the prototype. The product is for anyone who runs paid one-on-one calls. We make **no medical, legal or compliance claims**.

## Jobs to be done

1. After a call, know exactly what was promised and by whom.
2. Know which client needs attention before they leave.
3. Get a follow-up drafted in my tone, ready to approve.
4. Never leak client conversations to a third party without seeing exactly what went out.

## User stories (MVP)

| ID | Story | Acceptance |
|---|---|---|
| U1 | As a provider, I add a call recording for a client | File accepted, appears in call list, processing starts |
| U2 | I see what Quill is doing while it runs | Step list updates live, each step shows a plain result |
| U3 | I see the promises found, split by who made them | Table with who, what, due, status |
| U4 | Quill asks me about unclear promises instead of guessing | A question card with Yes/No |
| U5 | I approve, edit or dismiss each drafted email or reminder | State changes, nothing sent without approval |
| U6 | I see everything that left my laptop | Ledger with exact contents |
| U7 | I see all open promises and reminders across clients | Dashboard |
| U8 | I can switch between clients | Sidebar, workspace resets |

## Scope

**In (MVP):** U1 to U8 with one call at a time; Whisper locally; open-weight LLM through Ollama; promise extraction; history search over earlier calls; dropout-risk estimate; drafts; durable reminders; dashboard; egress ledger; synthetic data only.

**Stretch:** multi-file queue with a client dropdown per file; auto-marking promises done when the next call mentions them.

**Out:** folder watching, email sending, calendar, accounts, mobile app, real client data.

## Success criteria for the challenge

- A 90-second demo that shows an agent making a visible decision (different outcome per client).
- A measured claim that open beat closed somewhere, and an honest note on where it lost.
- A post that explains who would pay and why open models matter here.

## Decisions log

| Decision | Reason |
|---|---|
| Agent, not transcriber | Transcription alone is a voice-memo feature; the decisions after it are the product |
| Local-first | Matches the prompt's privacy example and is the core open-vs-closed story |
| Freelancer, consultant, coach as users | Broad enough to pay, narrow enough to demo, no health data |
| Approval required for everything | Safer, and keeps the claim honest |
| Synthetic data only | No real client data available; ground truth is known so tests are meaningful |
| Replay mode for the public demo | Render cannot run a model on the free tier |
| Egress ledger as the differentiator | Makes the privacy claim visible and checkable |
| Draft, copy, or open mail app instead of sending | Avoids email infrastructure in two days |

## Claims we will not make

HIPAA, GDPR or legal compliance; medical or clinical use; accuracy on real-world data (our data is synthetic); that nothing ever leaves the machine (small, listed requests do).
