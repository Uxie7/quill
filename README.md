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

## Live mode (local or cloud database + local models)

> 📖 **Full step-by-step setup walkthrough**: See [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) for detailed instructions on setting up MongoDB Atlas (free tier) and Ollama on Windows, Mac, or Linux.

1. **Database** (Pick one):
   - **MongoDB Atlas** (Free cloud tier, zero installation): Create an M0 cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and set `MONGODB_URI` in `.env`.
   - **Local MongoDB**: Docker (`docker run -d --name quill-mongo -p 27017:27017 mongo:latest`) or Windows MSI installer.
2. **Local AI Model (Ollama)**:
   - Install from [ollama.com](https://ollama.com).
   - Pull the required models: `ollama pull qwen3:8b` (or `qwen2.5:7b`) and `ollama pull nomic-embed-text`.
3. **Environment setup**:
   - `cp .env.example .env` and update `MONGODB_URI` / `LLM_MODEL`.
4. **Seed database & run**:
   - `npm install && npm run seed`
   - `npm run dev` and open http://localhost:3000

The "Use the sample call" button works without audio: it feeds the scripted transcript through the same pipeline. Uploading a real audio file needs whisper.cpp (`WHISPER_BIN`, `WHISPER_MODEL`).

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
