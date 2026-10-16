# 02. Architecture

## Two modes, one codebase

| Mode | Where | Model and data | Purpose |
|---|---|---|---|
| **live** | Your laptop | Real Whisper, Ollama, local MongoDB, Temporal dev server | The real product, the demo video, benchmarks |
| **replay** | Render | Pre-recorded agent runs served from JSON, Atlas free cluster with synthetic data | Public link people can click |

Render's free tier cannot run a model or Temporal, so the public site replays recorded runs. Say so plainly in the post.

## System overview

```mermaid
flowchart LR
  subgraph Laptop["Practitioner laptop (live mode)"]
    UI["Frontend: single HTML app"] --> API["API server"]
    API --> TW["Temporal workflow"]
    TW --> A1["Activity: transcribe (ffmpeg + Whisper)"]
    TW --> A2["Activity: extract promises (LLM)"]
    TW --> A3["Activity: agent run (Mastra)"]
    A3 <--> LLM["Ollama: open-weight LLM"]
    A3 --> T1["search_past_notes"]
    A3 --> T2["predict_dropout_risk"]
    A3 --> T3["find_resource"]
    A3 --> T4["draft_followup"]
    A3 --> T5["schedule_reminder"]
    T1 <--> DB[("MongoDB")]
    GATE["Egress wrapper + redaction gate"]
  end
  T2 --> GATE --> TP["TabPFN service"]
  T3 --> GATE --> SA["SerpApi"]
  API -. "traces" .-> SE["Sentry"]
```

## One call, end to end

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant API as API
  participant TW as Temporal
  participant AG as Agent
  participant DB as MongoDB
  U->>FE: Choose client, drop file
  FE->>API: POST /api/calls
  API->>TW: start processCall(callId)
  API-->>FE: callId
  FE->>API: GET /api/calls/id/stream (SSE)
  TW->>TW: transcribe, extract promises
  TW->>AG: run agent with context
  AG->>DB: search_past_notes
  AG->>AG: predict risk, decide, find resource, draft
  AG-->>TW: result (promises, question, drafts)
  TW->>DB: save result
  API-->>FE: step events, then done
  FE->>API: GET /api/calls/id/results
  U->>FE: Approve draft
  FE->>API: POST /api/actions/id/approve
  API->>TW: signal approved
  TW->>TW: start durable reminder timer
```

## Data model

```mermaid
erDiagram
  CLIENT ||--o{ CALL : has
  CALL ||--o{ CHUNK : "split into"
  CALL ||--o{ COMMITMENT : contains
  CALL ||--o{ ACTION : produces
  CLIENT ||--o{ COMMITMENT : owns
  ACTION ||--o| REMINDER : "may create"
  CALL ||--o{ EGRESS : logs
  CALL ||--o{ STEP : records
```

Fields are in [07-data-and-database](07-data-and-database.md).

## Components

| Component | Tech | Doc |
|---|---|---|
| Frontend | Plain HTML, CSS, JS (already built) | 03 |
| API | Node and TypeScript, Express | 04 |
| Agent | Mastra, zod tool schemas | 05 |
| Speech | ffmpeg, whisper.cpp | 06 |
| LLM and embeddings | Ollama with an open-weight model and an embedding model | 06 |
| Database | MongoDB (local or Atlas), vector search | 07 |
| Jobs and timers | Temporal TypeScript SDK | 08 |
| Egress control | Wrapper and redaction gate in the API | 09 |
| Risk prediction | TabPFN behind a small Python service | 10 |
| Search | SerpApi | 10 |
| Tracing | Sentry | 10 |

## Repo layout

```
quill/
  apps/
    web/public/index.html        the built frontend
    api/src/
      server.ts                  routes, static files, SSE
      routes/                    clients, calls, actions, dashboard
      agent/                     agent.ts, prompts.ts, schemas.ts
      tools/                     one file per tool
      egress/                    wrapper.ts, gate.ts
      db/                        client.ts, models.ts, seed.ts
      workflows/                 processCall.ts, reminder.ts
      activities/                transcribe.ts, extract.ts, embed.ts
      worker.ts                  Temporal worker
      replay/                    replay mode loader
  services/tabpfn/               FastAPI app (Python)
  data/
    scripts/                     scripted call JSON with ground truth
    audio/                       generated MP3 and WAV
    attendance.csv               synthetic table for TabPFN
    replay/                      recorded agent runs
    eval/                        ground truth and results
  scripts/                       gen-audio, gen-attendance, run-eval
  docs/                          these files
```

## Design principles

1. **Perception is fixed, decisions are agentic.** Transcription and extraction always run. The agent chooses what happens after.
2. **Everything outbound goes through one wrapper.** No exceptions (see 09).
3. **Every step is a span and a UI row.** The same step list feeds the trace UI and Sentry.
4. **Nothing is sent to a client automatically.** Approval is a hard gate.
5. **Same code, two modes.** A single env flag switches live and replay.
