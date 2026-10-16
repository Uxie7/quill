# Quill docs

Working name: **Quill** (QuillBot is an existing product, so rename before publishing).
Built for the Hacktoberfest Open-Source AI Challenge, Week 2, theme **Side Hustle**. Due **Oct 18, 2026**.

## The project in plain words

People who sell their time (freelancers, consultants, coaches, tutors) get a pile of small jobs after every client call: remember what each side promised, write the follow-up, notice when a client is going quiet.

Quill does that. You drop in the recording of a call. On your own laptop, Quill:

1. Turns the speech into text.
2. Finds the promises made, by you and by the client.
3. Looks back at earlier calls with that client for patterns.
4. Estimates whether the client may be drifting away.
5. Decides the right next step and drafts it (a follow-up email, a reminder).
6. Waits for **you** to approve. Nothing is sent automatically.

## What "tracking" means

Quill keeps a history per client, on your laptop: call dates, the text of each call, the promises and their status (open, done, overdue), and notes like "keeps delaying the logo decision". Each new call adds to that history, so Quill gets more useful the more calls it has seen. Call 1 can only list promises. By call 4 it can say "missed 2 of the last 4" or "this is the third delay".

## How a call gets in

You do not record anything by hand and Quill never joins your calls. You record the way you already do (Zoom, Meet, phone voice memo), then drop the file into Quill. Everything after that is automatic, except answering unclear questions and approving drafts.

## Scope right now

| In | Out (for now) |
|---|---|
| One call at a time | Watching a folder automatically |
| Three sample client types: freelancer, consultant, coach or tutor | Calendar or CRM integration |
| Local transcription, promise extraction, history search | Sending real emails (we draft, copy, or open your mail app) |
| Dropout-risk estimate, drafts, reminders | Real client data (everything is synthetic) |
| Dashboard across clients | Compliance claims of any kind |
| Egress ledger showing everything that leaves the laptop | Multi-user accounts |

Stretch if time allows: several files at once with a processing queue.

## Doc index

| Doc | What it covers | Read it if you are... |
|---|---|---|
| [01-product-scope](01-product-scope.md) | Users, stories, scope, decisions | Anyone, first |
| [02-architecture](02-architecture.md) | Diagrams, components, data flow, repo layout | Building anything |
| [03-frontend](03-frontend.md) | The built prototype and how to wire it to a backend | Working on the UI |
| [04-api-contract](04-api-contract.md) | Endpoints and JSON shapes | Connecting UI and backend |
| [05-agent](05-agent.md) | The Mastra agent, tools, prompts, decision rules | Building the AI part |
| [06-speech-and-models](06-speech-and-models.md) | Whisper, local LLM, embeddings, speaker problem | Setting up models |
| [07-data-and-database](07-data-and-database.md) | MongoDB schema, synthetic data, TabPFN dataset | Building storage and fixtures |
| [08-workflows-temporal](08-workflows-temporal.md) | Durable workflow, timers, retries | Building the job runner |
| [09-privacy-and-egress](09-privacy-and-egress.md) | What leaves the laptop and how we prove it | Anything touching the network |
| [10-integrations](10-integrations.md) | TabPFN, SerpApi, ElevenLabs, Sentry, Copilot | Wiring partner tools |
| [11-deployment-and-setup](11-deployment-and-setup.md) | Install steps, env vars, Render | Getting it running |
| [12-testing](12-testing.md) | Tests, metrics, evidence for the post | Verifying it works |
| [13-build-plan](13-build-plan.md) | Milestones, order of work, cut lines | Planning the two days |
| [14-submission](14-submission.md) | Challenge requirements, post, demo script | Writing it up |
| [15-data-model](15-data-model.md) | Full entity diagram, schemas, state machines, rules | Building storage and validation |
| [16-code-skeleton](16-code-skeleton.md) | Near-runnable code for each part | Starting to code |

## Honesty note

Package names, commands and free-tier limits in these docs are from memory and may have changed. Each doc marks the uncertain ones with **(verify)**. The first two hours of the build should be spent checking them.
