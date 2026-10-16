# 13. Build plan

Today is Oct 16, 2026 and the deadline is **Oct 18**. This is about two days of work, so the plan is ordered to get a thin end-to-end version first and add depth after. Hour estimates are rough.

## First two hours: spikes

Prove each risky thing works before building on it. Stop and swap if any fails.

| Spike | Pass condition | If it fails |
|---|---|---|
| whisper.cpp transcribes a WAV | Text comes out in reasonable time | Use a smaller model |
| Ollama model returns valid JSON for extraction | 3 out of 3 on a sample | Try another model |
| Mastra agent calls one tool with an Ollama model | Tool executes | Drive tool order from code |
| TabPFN returns a probability | Number comes back | Use the local package or drop to logistic regression and say so |
| Temporal dev server runs a hello workflow | Visible in the UI | Replace with a simple job queue and drop the category |
| MongoDB vector query | Returns a chunk | Compute cosine in code |
| ElevenLabs creates one clip | Audio plays | Record yourself reading scripts |

## Milestones

| # | Milestone | Deliverable | Est. |
|---|---|---|---|
| M0 | Accounts, repo, env, spikes | Spikes pass, repo created | 2 h |
| M1 | Data | 3 scripts with ground truth, 1 audio file, seed script, attendance CSV | 3 h |
| M2 | Speech | Upload to transcript saved | 2 h |
| M3 | Extraction | Promises with quotes saved, firm and unclear | 2 h |
| M4 | Agent | Tools, decision policy, drafts, `why` | 4 h |
| M5 | API and frontend wiring | SSE trace, results, approve, answer | 4 h |
| M6 | Temporal | processCall workflow, reminder timers | 3 h |
| M7 | Egress and Sentry | Wrapper, gate, ledger UI, traces | 2 h |
| M8 | Dashboard, replay mode, Render deploy | Public link works | 3 h |
| M9 | Eval, benchmark, tests | Numbers for the post | 3 h |
| M10 | Demo video and post | Published on DEV | 5 h |

## Suggested split across the days

| Day | Focus |
|---|---|
| Oct 16 | M0 to M4 |
| Oct 17 | M5 to M8 |
| Oct 18 | M9, M10, submit with buffer before the deadline |

Check the exact submission cutoff time and timezone on the challenge page. Aim to publish at least a few hours early.

## Definition of done per milestone

Each milestone has a command that proves it: a script run, a passing test, or a smoke test step from 11. Do not move on without one.

## Cut lines

Drop in this order if time runs short.

1. Sentry dashboards (keep basic spans)
2. SerpApi and `find_resource` (use a static resource list)
3. Vector search (use keyword search or plain cosine)
4. Model comparison beyond one alternative
5. Dashboard polish
6. Gemma or extra models
7. First-user bonus

**Never cut:** the agent decision step, the egress ledger, honest eval numbers, the write-up.

## Minimum shippable version

One client works end to end live: upload, transcript, promises, risk, drafts, approval, ledger. Plus replay mode for the other two. Everything else is gravy.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Local model unreliable at tool calling | Medium | Code-driven tool order, model chooses branch |
| Speaker attribution weak | High | Show quotes, flip button, report accuracy |
| Transcription slow on laptop | Medium | `small.en`, shorter sample calls |
| Free-tier limits (ElevenLabs, SerpApi) | Medium | Short scripts, cache, record fallback |
| Temporal setup eats time | Medium | Spike first, cut line available |
| Render cold start during judging | Medium | Mention it, include a video |
| Privacy claim overreach | Low if followed | Use only the claims in 09 |
| Time | High | This plan, cut lines, early publish |

## Working with Copilot and notes

Keep a running `NOTES.md` while you build: what you tried, what failed, numbers you measured. It becomes the raw material for the post and costs a minute each time.
