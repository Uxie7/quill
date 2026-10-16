# Quill: instructions for Copilot
Read docs/README.md first. The docs are the source of truth: types in docs/15-data-model.md, endpoints in
docs/04-api-contract.md, code patterns in docs/16-code-skeleton.md.
- TypeScript, Node 20, ES modules, Express, MongoDB, zod. The frontend is plain HTML and JS in apps/web/public/index.html. Do not add a framework.
- Never call external hosts outside apps/api/src/egress/ (see docs/09). Never send audio, transcripts or client names to any external service.
- Do not invent library APIs. If unsure of a package's current API, say so and mark it TODO(verify).
- Keep changes small, add a test for each new module, and append what you did to NOTES.md.
- End every task by listing the exact commands I should run to verify it.
