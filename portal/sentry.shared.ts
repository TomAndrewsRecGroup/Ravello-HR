// Sentry configuration shared by the client, server and edge runtimes.
//
// INERT WITHOUT A DSN. Sentry.init({ dsn: undefined }) is a documented
// no-op, so local development and preview builds cost nothing and no
// events leave the machine. Set SENTRY_DSN (and
// NEXT_PUBLIC_SENTRY_DSN for the browser half) in Vercel to switch it
// on — nothing else needs changing.
//
// Why this exists: before it, a failed Supabase query returned null
// data, the page rendered empty, and nobody was told. That is
// indistinguishable from a client who genuinely has no records, which
// is how a whole page could be dead in production without anyone
// noticing.

export const SENTRY_ENVIRONMENT =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';

export const SENTRY_ENABLED = Boolean(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
);

export const sentryBaseOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Sampled rather than 1.0: this is an HR platform, traces carry
  // employee context and volume costs money. Errors are always sent.
  tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 0,

  // Never send the user's IP or cookies by default. HR data is
  // special-category under UK GDPR; an error report is not a reason to
  // ship it to a third party.
  sendDefaultPii: false,

  // Noise that tells us nothing and would train the team to ignore
  // the alert channel.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'AbortError',
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
  ],

  beforeSend(event: any) {
    // Strip anything that looks like a credential before it leaves.
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
      delete event.request.headers.apikey;
    }
    return event;
  },
};

export const APP_NAME = 'portal';
