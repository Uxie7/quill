# 10. Integrations

Each partner tool has one job. Check free-tier and card requirements at signup. **(verify)** everywhere below.

| Tool | Job in Quill | Needed for MVP? |
|---|---|---|
| Mastra | Agent and tools | Yes |
| MongoDB | Data and vector search | Yes |
| Temporal | Durable workflow and reminders | Yes |
| TabPFN | Dropout-risk prediction | Yes |
| Sentry | Agent tracing | Yes |
| Render | Public replay demo | Yes |
| ElevenLabs | Synthetic calls and demo narration | Yes |
| GitHub Copilot | Build tool (CLI) | Easy |
| SerpApi | Resource lookup | Optional |
| DevRelay or similar | Saved build sessions | Optional |

## Mastra

Install: `npm i @mastra/core zod`. Create one agent with the tools from 05. Use an Ollama provider for the model (community AI SDK provider, **verify** the package name and how Mastra expects local models today). Keep tool inputs small and strictly typed. If the local model is poor at tool calling, drive the tool order from code (a fixed sequence with the model filling arguments) and let the model decide only the branch (policy table). Say this honestly in the post.

## TabPFN

Run as a small Python service so the Node API stays simple.

```
services/tabpfn/
  app.py            FastAPI: POST /risk
  requirements.txt  fastapi, uvicorn, tabpfn-client (or tabpfn), pandas
```

```python
# app.py (sketch, verify against current TabPFN docs)
from fastapi import FastAPI
import pandas as pd
app = FastAPI()
train = pd.read_csv("../../data/attendance.csv")
X, y = train.drop(columns=["dropped_30d"]), train["dropped_30d"]
# from tabpfn_client import TabPFNClassifier   # hosted API
# from tabpfn import TabPFNClassifier          # local
clf = TabPFNClassifier(); clf.fit(X, y)

@app.post("/risk")
def risk(f: dict):
    row = pd.DataFrame([f])
    return {"risk": float(clf.predict_proba(row)[0][1])}
```

Setup: create an account at platform.priorlabs.ai, accept the free non-commercial license, get an API key, set `TABPFN_TOKEN` (**verify** the variable name). The license is non-commercial: fine for the challenge, but mention it in the post since the theme is "someone would pay". Evaluate against logistic regression (see 12). Report the numbers honestly, even if TabPFN only ties.

## SerpApi

One call per resource lookup, always through the egress wrapper.

```
GET https://serpapi.com/search.json?engine=google&q=<topic>&num=5&api_key=<key>
```

Take the first useful organic result (title, link, snippet). Cache by topic in MongoDB so repeat topics cost nothing. Keep a counter and refuse to search when you are near the free monthly cap (**verify** the cap). Send GET parameters through the wrapper too, so the ledger shows the query.

## ElevenLabs

Used to make test audio and the demo voiceover.

Synthetic calls:

1. For each line in a script, call text-to-speech with the voice for that speaker (`POST /v1/text-to-speech/{voice_id}`, **verify** model names and limits).
2. Save each clip, then join in order with ffmpeg: `ffmpeg -f concat -safe 0 -i list.txt -c copy dana-06.mp3`.
3. Keep scripts short. The free tier has a monthly character cap (**verify**), so generate the three latest calls first and the earlier ones only as needed. Earlier calls can be seeded as text only, since the agent searches transcripts, not audio.

Demo narration: write the narration to a file, synthesize once, lay it over the screen recording.

Keep API keys in `.env`, never in the repo.

## Sentry

`npm i @sentry/node`. Initialise at server start with tracing on.

Manual spans are the reliable path:

```ts
await Sentry.startSpan({ name: 'tool.search_past_notes', op: 'agent.tool' }, async (span) => {
  const r = await searchPastNotes(args);
  span.setAttribute('chunks', r.length);
  return r;
});
```

Naming: `agent.run` (root), `activity.transcribe`, `activity.extract`, `tool.<id>`, `llm.call`. Record model name and token counts on `llm.call` spans if your provider returns them. Some AI-framework integrations can record spans automatically (**verify** whether the one you use supports Mastra and Ollama), but do not depend on it.

Capture for the post: a trace waterfall for one call, average time per step, tokens per call, and the one slow step you found and fixed. Follow the privacy rules in 09.

## GitHub Copilot (build tool)

Install the CLI (**verify** current command, for example `npm install -g @github/copilot`), run `copilot`, sign in. Use it for scaffolding, tests and boilerplate. Keep notes on what it did well and badly for the post, and save the session transcripts if the tool allows.

## Saved agent sessions

The challenge suggests saving your agent sessions and embedding or linking them. Test your tool on a throwaway session first. If the tool fails to capture your coding agent, use a fallback that exports sessions to local markdown (**verify** what is available) or paste a short annotated excerpt into the post instead.

## Render

See 11. It hosts the replay deployment only.
