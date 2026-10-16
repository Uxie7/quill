# 12. Testing and evidence

Tests do two jobs: keep the build working, and produce the numbers the post needs. All data is synthetic with known ground truth.

## Levels

| Level | What | Tool |
|---|---|---|
| Unit | Redaction gate, ledger writer, quote-in-transcript check, due-date parser, policy mapper | Vitest |
| Tool | Each tool with fixtures and failures | Vitest |
| Activity | Transcribe, extract, embed against sample files | Vitest plus small audio |
| Workflow | Retries, signals, timers | Temporal test environment (**verify**) |
| Agent eval | 12 scripted calls vs ground truth | `npm run eval` |
| API | Endpoints match 04 | Supertest |
| End to end | Upload to approved reminder | Playwright or manual twice in a row |
| Privacy | Egress and payload checks | Custom test |

## Agent eval (the important one)

Data: `data/eval/sessions.json` (ground truth from the scripts, see 07). For each call, run the full pipeline and compare.

| Metric | How | Target |
|---|---|---|
| Promise recall | Truth items matched by extracted items (fuzzy text match plus same `who`) / truth items | At least 0.8 |
| Promise precision | Matched extracted items / extracted items | At least 0.8 |
| Invented promises | Extracted items with no truth match and a quote that does not contain the claim | At most 1 in 12 calls |
| Speaker accuracy | Matched items with the right `who` / matched items | Report, no hard target |
| Ambiguity routing | Hedged truth items marked `unclear` / hedged truth items | At least 0.8 |
| Policy compliance | Next step matches the decision table for the risk used | At least 11 of 12 |
| Quote validity | Every `quote` is a substring of the transcript | 100% (code check) |

Fuzzy match: normalise text, compare with token overlap or embedding similarity above a threshold. Spot-check mismatches by hand for the post.

## Transcription

Compare Whisper output with the script text for each synthetic call. Use word error rate (Python `jiwer`). Run `small.en` and `medium.en` and record WER, time, and memory. The scripts are the exact truth, so this is clean evidence for the post.

## TabPFN

Split attendance data 80/20. Train and evaluate TabPFN and logistic regression. Report AUC and accuracy for both. Note that the data is synthetic, so the result shows the tool works in the pipeline, not real-world accuracy. Keep it honest if there is no gap.

## Model swap benchmark

Run the eval set across 2 or 3 models by changing only `LLM_MODEL`. Report promise recall and precision, valid JSON rate, policy compliance and seconds per call. This is the "open lets you swap models" proof.

## Durability tests

| Test | Pass |
|---|---|
| Kill the worker during analysis, restart | Workflow resumes from the last finished activity, no duplicate steps |
| Make search fail twice then succeed | Three attempts, step succeeds, three ledger rows |
| Approve a reminder, restart all processes | Timer still fires and reminder becomes `due` |
| Approve the same action twice | One timer only |

## Privacy tests

| Test | Pass |
|---|---|
| Run a full call with the network disabled except localhost, with prediction local and search off | Completes, zero ledger entries |
| Search ledger payloads for every client name and distinctive transcript phrase | Zero matches |
| Try to send a search topic containing a client name | Gate rejects, ledger has no entry for it |
| Grep source for outbound calls outside the wrapper | None |
| Inspect a Sentry event | No transcript text or prompt contents |

## Frontend checks

Processing a sample for each of the three clients shows different decisions. Dashboard counts match the data. Buttons produce visible state changes. Error states appear when the model is stopped. Keyboard navigation works. Layout holds at 390px and 1280px widths.

## Cost and speed

Record seconds per call for each step (from Sentry), tokens per call, and the cost per call for local (electricity aside, effectively zero) against a closed alternative you can price from public rates (**verify** current rates). If you compare against a closed model, use the same eval set and state which model and when.

## Evidence table for the post

| Claim | Evidence | Source of number |
|---|---|---|
| Recordings and transcripts never leave | Privacy tests | Test run |
| Open model is good enough | Recall and precision across models | Eval |
| Transcription is accurate | WER | jiwer |
| Swapping models took no code changes | Env var only | Benchmark |
| Prediction adds value | AUC vs baseline | sklearn |
| Where open lost | Speed, nuance, speaker labels | Eval and notes |

## Definition of done

All targets met or honestly reported, end to end works twice in a row, the smoke test in 11 passes on a clean clone.
