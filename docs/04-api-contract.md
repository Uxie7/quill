# 04. API contract

Base path `/api`. JSON unless noted. All timestamps ISO 8601. Single user, no auth in the MVP (the server binds to localhost in live mode).

## Types

```ts
type Role = 'freelancer' | 'consultant' | 'coach';

interface Client { id: string; name: string; role: Role; gig: string; createdAt: string; }

interface Step {
  id: string;            // 'transcribe' | 'extract' | 'history' | 'risk' | 'decide' | 'resource' | 'draft'
  title: string;         // plain wording, e.g. "Listening to the call"
  tech: string;          // e.g. "transcribe_audio, Whisper on this laptop"
  result: string;        // one plain sentence
  ms: number;
  egress?: { to: string; contents: string };
}

interface Commitment {
  id: string; clientId: string; callId: string;
  who: 'you' | 'client';
  text: string;
  due: string | null;    // free text like "Friday" plus dueAt when resolvable
  dueAt?: string;
  status: 'open' | 'done' | 'overdue' | 'unclear';
  quote: string;         // exact transcript text it came from
  confidence: number;    // 0 to 1
}

interface Draft {
  id: string; callId: string; clientId: string;
  kind: 'email' | 'reminder';
  subject?: string; body: string;
  remindAt?: string;
  state: 'pending' | 'approved' | 'dismissed';
}

interface CallResult {
  callId: string; clientId: string;
  summary: { promisesFound: number; needsAnswer: number; flag: string; flagLevel: 'warn' | 'ok' };
  commitments: Commitment[];
  question?: { commitmentId: string; title: string; text: string; yesLabel: string };
  why: string;           // one sentence reason for the chosen next step
  drafts: Draft[];
  steps: Step[];
}
```

## Endpoints

### Clients

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/clients` | none | `Client[]` |
| POST | `/clients` | `{ name, role, gig }` | `Client` |

### Calls

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/calls` | multipart: `audio` (file), `clientId` | `{ callId }` (201) |
| POST | `/calls/sample` | `{ clientKey: 'dana' \| 'marcus' \| 'ines' }` | `{ callId }` |
| GET | `/calls/:id` | none | `{ id, clientId, status, startedAt, steps: Step[] }` |
| GET | `/calls/:id/stream` | none | SSE, see below |
| GET | `/calls/:id/results` | none | `CallResult` (409 until done) |

`status`: `queued`, `transcribing`, `analyzing`, `awaiting_approval`, `done`, `failed`.

File rules: audio or video, up to 500 MB, extensions m4a, mp3, wav, mp4, webm, ogg. Reject others with 415.

### SSE events (`/calls/:id/stream`)

```
event: step
data: {"id":"risk","title":"Checking if Dana is going quiet","tech":"predict_dropout_risk, TabPFN","result":"Missed 2 of the last 4 calls. Risk is high at 0.68.","ms":1800,"egress":{"to":"TabPFN prediction service","contents":"..."}}

event: done
data: {"callId":"..."}

event: error
data: {"message":"Transcription failed","step":"transcribe"}
```

The server sends each step as soon as it finishes. Replay mode emits the same events with recorded timings.

### Actions and answers

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/actions/:id/approve` | `{ body?: string }` (edited text) | `{ state: 'approved', mailto?: string }` |
| POST | `/actions/:id/dismiss` | none | `{ state: 'dismissed' }` |
| POST | `/commitments/:id/answer` | `{ track: boolean }` | `Commitment` |
| PATCH | `/commitments/:id` | `{ status?: 'done' \| 'open', who?: 'you' \| 'client' }` | `Commitment` |

Approving a `reminder` draft starts a Temporal timer. Approving an `email` draft marks it approved and returns a `mailto:` link. Nothing is sent.

### Dashboard, reminders, privacy

| Method | Path | Returns |
|---|---|---|
| GET | `/dashboard` | `{ counts: { open, overdue, reminders, invoices }, needs: Commitment[], reminders: Reminder[], clients: ClientGlance[] }` |
| GET | `/reminders` | `Reminder[]` |
| POST | `/reminders` | `{ text, clientId, remindAt }` then `Reminder` |
| GET | `/egress` | `EgressEntry[]` newest first |

```ts
interface ClientGlance { clientId: string; name: string; role: Role; lastCallAt: string; openPromises: number; status: 'attention' | 'ok' | 'watch'; statusLabel: string; }
interface Reminder { id: string; clientId: string; text: string; remindAt: string; state: 'scheduled' | 'due' | 'done'; }
interface EgressEntry { id: string; callId?: string; to: string; contents: string; reason: string; at: string; }
```

`invoices` counts open commitments by you whose text mentions an invoice.

## Errors

```json
{ "error": { "code": "unsupported_media", "message": "Use an audio or video file." } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `bad_request` | 400 | Missing or invalid field |
| `not_found` | 404 | Unknown id |
| `not_ready` | 409 | Results requested too early |
| `unsupported_media` | 415 | File type rejected |
| `model_unavailable` | 503 | Ollama or Whisper not reachable |
| `internal` | 500 | Anything else, details in Sentry |

## Rules

- IDs are strings (Mongo ObjectId hex).
- Idempotent approve: approving twice returns the same result, no second timer.
- Replay mode: `POST /calls` still returns a `callId`, ignores the file, and replays a recorded run chosen by `clientId`.
