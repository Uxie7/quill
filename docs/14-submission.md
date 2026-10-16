# 14. Submission

## Challenge facts

| Item | Detail |
|---|---|
| Challenge | Hacktoberfest Open-Source AI Challenge, Week 2 (Challenge 3 of 5) |
| Theme | Side Hustle: build something with open-source AI at its core that someone would pay for |
| Contest start | Oct 12, 2026 |
| Submissions due | Oct 18, 2026 (confirm time and timezone) |
| Winners | Week of Oct 19 |
| Where | A post on DEV using the submission template |
| Required tags | `#devchallenge` and `#hf26challenge` (the template adds them) |

## What the post must include

| Requirement | Where we cover it |
|---|---|
| What you built and who would pay | Opening and "Who this is for" |
| A demo | Embedded video plus screenshots |
| Why open innovation matters | "Why open" section with evidence |
| Where open beat closed | Evidence table (12), plus where it lost |
| Optional: saved agent sessions | Linked or embedded |
| Bonus: first user | Honest account, even if "not yet" |

## Judging

Writing quality is weighted most heavily, then relevance to the prompt, creativity, technical execution, and optional partner technology.

## Post outline

1. **Opening scene.** A freelancer finishes a call at 6 pm and faces an hour of follow-ups. Two or three sentences.
2. **What Quill is.** Plain words, one screenshot.
3. **Who would pay.** The three users, what they lose today, what a month of it might cost them. Say it is untested pricing unless you tested it.
4. **The demo.** Video. Describe what the agent decided and why, for two different clients.
5. **How it works.** One diagram, a short paragraph per part. Fixed steps versus the agent's decisions.
6. **Why open mattered.** Offline run, the egress ledger, swapping models, cost.
7. **Where open lost.** Speed, speaker labels, small-model quirks. Honest losses make the wins believable.
8. **Numbers.** WER, recall and precision, model swap table, AUC, seconds per call.
9. **First user.** Who, what they did, what they said, did they pay or would they.
10. **What is next.** Folder watching, multi-call queue, auto-closing promises, Gemma and Tinker next week.
11. **Disclosures.** Synthetic data, TabPFN non-commercial license, replay mode on Render, not a compliance tool.

Tone: first person, specific, a little funny where honest. Avoid feature lists.

## Demo video (90 seconds)

| Time | Scene |
|---|---|
| 0:00 | Problem in one sentence over the Overview page |
| 0:10 | Onboarding clicks, pick a client |
| 0:20 | Drop a call, trace runs, technical toggle on |
| 0:40 | Ledger shows two small requests, amber |
| 0:50 | Results: promises, unclear question answered |
| 1:00 | Approve email and reminder |
| 1:08 | Switch to Marcus: different decision, light touch |
| 1:18 | Dashboard across clients |
| 1:25 | Network off, run again: nothing leaves |
| 1:30 | End card with link |

Narration: write it, synthesize with ElevenLabs, keep it under 150 words.

## Partner categories: what to show

| Category | Show |
|---|---|
| Mastra | The agent, tools, decision policy |
| MongoDB Atlas | History and vector search, Atlas demo data (if used) |
| TabPFN | The risk step, AUC against a baseline |
| Temporal | The workflow, a kill-and-resume demo, durable reminder |
| Sentry | A real trace with a bottleneck you found |
| Render | The public replay link |
| ElevenLabs | Synthetic calls and the demo narration |
| GitHub Copilot | How you used the CLI, one honest example |
| SerpApi | The resource lookup and cache |
| Entire / agent sessions | Saved session link, if it works |

Check each category's exact requirement on the challenge page before claiming it. Entering many categories is optional. Quality of the main post matters more.

## First user plan

Find one freelancer, consultant, coach or tutor. Ask them to try it on a call recording of their own, or on the sample. Watch silently. Write down: what confused them, what they liked, whether they would pay, what they asked for next. Quote them with permission. Even one person counts.

## Disclosures checklist

- [ ] Data is synthetic
- [ ] Public site is replay mode, not live
- [ ] TabPFN API is non-commercial licensed
- [ ] The prediction call includes the training table (see 09)
- [ ] Not a medical, legal or compliance tool
- [ ] Speaker attribution is inferred and imperfect
- [ ] Rename from QuillBot-like name before publishing

## Final checks before submitting

- [ ] Tags present, template used
- [ ] Video plays, links open
- [ ] Repo public with license and README
- [ ] Numbers in the post match the latest eval run
- [ ] No keys in the repo
- [ ] Published before the deadline
