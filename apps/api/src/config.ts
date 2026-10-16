import 'dotenv/config';

export const cfg = {
  mode: process.env.MODE ?? 'live',
  port: Number(process.env.PORT ?? 3000),
  mongo: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/quill',
  llmBase: process.env.LLM_BASE_URL ?? 'http://localhost:11434',
  llmModel: process.env.LLM_MODEL ?? 'qwen3:8b',
  embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text',
  whisperBin: process.env.WHISPER_BIN ?? 'whisper-cli',
  whisperModel: process.env.WHISPER_MODEL ?? '',
  practitioner: process.env.PRACTITIONER_NAME ?? 'Alex',
  tabpfnMode: (process.env.TABPFN_MODE ?? 'heuristic') as 'api' | 'local' | 'heuristic',
  tabpfnUrl: process.env.TABPFN_URL ?? 'http://localhost:8001',
  serpKey: process.env.SERPAPI_KEY ?? '',
  useTemporal: process.env.USE_TEMPORAL === '1',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  sentryDsn: process.env.SENTRY_DSN ?? '',
};
