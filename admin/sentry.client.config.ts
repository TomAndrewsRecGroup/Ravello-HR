import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions } from './sentry.shared';

Sentry.init({
  ...sentryBaseOptions,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Session replay is deliberately NOT enabled. It would record
  // employee records, salary figures and absence reasons.
  integrations: [],
});
