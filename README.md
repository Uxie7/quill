# Quill

An agent that does the follow-up work after every client call: it finds who promised what, notices clients who are
drifting, and drafts the next step for you to approve. Transcription and drafting run on open models on your own
laptop. Every request that leaves the laptop is listed in an egress ledger.

Working name (QuillBot is an existing product, rename before publishing).
Built for the Hacktoberfest Open-Source AI Challenge (Side Hustle). All data is synthetic.

Full docs are in `docs/` (start with `docs/README.md`).

## What is in this repo

| Path | What |
|---|---|
| `apps/web/public/index.html` | The frontend (plain HTML/JS), wired to the API |
| `apps/api/src` | API, agent, tools, egress gate, workflows, replay mode |
| `services/tabpfn` | Optional Python prediction service |
| `data/scripts` | Three scripted calls with ground truth |
| `data/history.json` | Earlier calls and attendance for the three sample clients |
| `data/replay` | Recorded runs for the public replay deployment |
| `scripts` | Attendance generator, audio generator, eval runner |

## What has and has not been tested

Tested here: type-check passes, 38 unit tests pass (dates, redaction gate, policy, scoring, chunking, model retry,
privacy lint, replay fixtures), the frontend script parses, and **replay mode** serves a full run over HTTP.

Not tested (needs your machine): live mode with MongoDB, Ollama, whisper.cpp, TabPFN, Temporal, Sentry, SerpApi and
ElevenLabs. Anything marked `TODO(verify)` in the code is a library detail to check against current docs.

## Quick start: replay mode (no database, no models)

```bash
npm install
MODE=replay npm run start        # http://localhost:3000
```

## Live mode

1. Install: Node 20, MongoDB (Docker: `docker run -d --name quill-mongo -p 27017:27017 mongodb/mongodb-atlas-local`),
   Ollama (`ollama pull qwen3:8b` and `ollama pull nomic-embed-text`). For audio: ffmpeg and a whisper.cpp build.
2. `cp .env.example .env` and edit it.
3. `npm install && npm run seed`
4. `npm run dev` and open http://localhost:3000

The "Use the sample call" button works without audio: it feeds the scripted transcript through the same pipeline.
Uploading a real audio file needs whisper.cpp (`WHISPER_BIN`, `WHISPER_MODEL`).

### Optional pieces

| Piece | How |
|---|---|
| Real audio for the samples | Set the ElevenLabs keys and voice ids, then `npm run gen:audio` |
| TabPFN | `pip install -r services/tabpfn/requirements.txt`, then `uvicorn services.tabpfn.app:app --port 8001` and set `TABPFN_MODE=api` (logged in the ledger) or `local` |
| Web search for attachments | Set `SERPAPI_KEY` |
| Temporal | `temporal server start-dev`, `npm run worker`, set `USE_TEMPORAL=1` |
| Sentry | Set `SENTRY_DSN` |
| Record the public demo | `npm run record` (after a seed), commit `data/replay/*.json` |
| Evidence for the post | With the server running, `npm run eval` |

Without TabPFN the risk step uses a built-in formula (the same one the synthetic data is generated from) and says
"estimated locally" in the step.

## Commands

`npm run dev | start | worker | seed | record | eval | gen:audio | gen:attendance | typecheck | test`

## Known gaps

- Speaker attribution is inferred by the model. The UI shows the exact quote and a "wrong person?" link, but the list does not refresh after a switch.
- Approving an email does not send it: you get Copy and Open in mail app.
- One call at a time. No multi-file queue, no folder watching.
- With Temporal off, reminders become "due" by time check when read, not by a durable timer.
- The Temporal worker bundling under `tsx` and the Mastra wrapper (`agent/mastra.ts`) are unverified.
