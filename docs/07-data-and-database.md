# 07. Data and database

## Collections (MongoDB)

| Collection | Key fields |
|---|---|
| `clients` | `_id, name, role, gig, createdAt` |
| `calls` | `_id, clientId, heldAt, minutes, audioPath, status, transcript, words, error?` |
| `chunks` | `_id, callId, clientId, start, text, embedding[768]` |
| `commitments` | `_id, clientId, callId, who, text, due, dueAt?, status, quote, confidence` |
| `actions` | `_id, callId, clientId, kind, subject?, body, remindAt?, state, workflowId?` |
| `reminders` | `_id, clientId, actionId, text, remindAt, state` |
| `steps` | `_id, callId, idx, stepId, title, tech, result, ms, egress?` |
| `egress` | `_id, callId?, to, contents, reason, at` |
| `attendance` | `_id, clientId, heldAt, status ('attended' or 'missed'), gapDays, replyHours` |

Raw audio stays on disk (`data/audio`), not in the database.

## Indexes

```js
db.chunks.createIndex({ clientId: 1, callId: 1 });
db.commitments.createIndex({ clientId: 1, status: 1 });
db.calls.createIndex({ clientId: 1, heldAt: -1 });
db.actions.createIndex({ callId: 1, state: 1 });
```

Vector search index on `chunks` (Atlas Vector Search definition):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "clientId" }
  ]
}
```

Query with `$vectorSearch`, filtering by `clientId` so one client's history never mixes with another's. Local Atlas-compatible image: `mongodb/mongodb-atlas-local` (**verify** vector search works there). Fallback: store embeddings and compute cosine similarity in code for a few hundred chunks. That is fast enough for the demo and removes the dependency.

## Example documents

```json
{ "_id": "c1", "clientId": "dana", "heldAt": "2026-10-14T15:00:00Z", "minutes": 34, "status": "done" }
{ "clientId": "dana", "callId": "c1", "who": "client", "text": "Send brand guidelines", "due": "Friday",
  "status": "open", "quote": "I'll get you the brand guidelines by Friday.", "confidence": 0.92 }
```

## Synthetic data plan

No real client data is used. Ground truth is known, so every claim can be tested.

### Scripts

12 short scripts, 4 per client (Dana, Marcus, Ines), about 5 to 8 minutes each (around 900 to 1,400 words). Each is JSON with ground truth:

```json
{
  "id": "dana-06",
  "client": "dana",
  "date": "2026-10-14",
  "lines": [
    { "speaker": "you", "text": "..." },
    { "speaker": "client", "text": "..." }
  ],
  "truth": {
    "commitments": [
      { "who": "client", "text": "send brand guidelines", "due": "Friday", "firm": true },
      { "who": "you", "text": "send revised logo draft", "due": "Monday", "firm": true },
      { "who": "client", "text": "approve the logo", "due": "next week", "firm": false }
    ],
    "avoidedTopic": "logo decision",
    "missedCalls": 2
  }
}
```

### Planted facts per client

| Client | Planted in earlier scripts | Planted in latest script |
|---|---|---|
| Dana | Logo decision delayed twice, one missed call | Another delay, second missed call, a vague "maybe next week" |
| Marcus | Asked about phase two once, attends everything | Hints at a second phase again, firm data deadline |
| Ines | Struggles with the serve toss twice | Mentions exams, may skip next week |

Write scripts so hedged commitments use clear hedging words ("maybe", "I might"). Then the firm/unclear split can be tested.

### Audio

Generate with ElevenLabs (see 10): two voices, one per speaker, per-line synthesis, joined with ffmpeg. Keep scripts short to respect the free character cap. Store at `data/audio/<id>.mp3`. The script text is the ground-truth transcript for word error rate.

### Attendance table for TabPFN

About 600 rows from a generator script (`scripts/gen-attendance.py`):

| Column | Meaning |
|---|---|
| `calls_so_far` | Number of calls held |
| `avg_gap_days` | Average days between calls |
| `last_gap_days` | Days since the previous call |
| `missed_count` | Missed calls so far |
| `avg_reply_hours` | Average time to reply to messages |
| `days_since_last_call` | Days since the last call |
| `dropped_30d` | Label: stopped within 30 days (0 or 1) |

Generate the label from a hidden rule (for example, risk rises with `missed_count` and `last_gap_days`, falls with fast replies) plus noise, so the pattern is learnable but not trivial. Split 80/20. **State plainly in the post that this is synthetic.** The point is to show the agent using a prediction, not to claim real-world accuracy.

### Seeding

`npm run seed` loads: three clients, earlier calls with transcripts and chunks (so history search has something to find), earlier commitments with some overdue, attendance rows, and a few reminders. Latest call per client is **not** pre-processed, so the demo can process it live.

## Replay fixtures

`npm run record -- dana` runs the live pipeline once and saves the steps, results and egress entries to `data/replay/dana.json`. Replay mode serves these.

## Retention and deletion

`npm run wipe` removes all collections and `data/audio`. Document it in the README. In live mode all data sits on the user's disk.
