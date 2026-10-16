import * as Sentry from '@sentry/node';
import { cfg } from './config';

export function initSentry() {
  if (!cfg.sentryDsn) return;
  Sentry.init({
    dsn: cfg.sentryDsn,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    // Metadata only: never send request bodies, transcripts or prompts.
    beforeSend(e) { delete e.request; return e; },
    beforeSendTransaction(e) { delete e.request; return e; },
  });
}
export { Sentry };
