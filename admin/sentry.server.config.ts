import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions } from './sentry.shared';

Sentry.init({ ...sentryBaseOptions, dsn: process.env.SENTRY_DSN });
