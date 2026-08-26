// Central reporting for failed Supabase queries.
//
// THE PROBLEM THIS SOLVES
//
// supabase-js returns errors, it does not throw them. So the house
// pattern `const { data } = await supabase.from(...)` discards the
// failure entirely: `data` is null, the page renders empty, and nobody
// is told. That is indistinguishable from a client who genuinely has no
// records — which is how a page can be completely dead in production
// without a single log line. It was measured across this codebase at 84
// single queries plus 30 inside Promise.all, against 113 sites that do
// check. Inconsistent, not absent, which is worse: you cannot tell by
// reading one file whether failures there are visible.
//
// WHY A PROXY RATHER THAN FIXING 114 CALL SITES
//
// Editing every call site fixes today and not tomorrow — the 115th is
// written next week and nothing catches it. Instrumenting where the
// query resolves catches every site, including ones not yet written,
// and cannot be forgotten.
//
// The builder is wrapped, not the client, and only `then` is
// intercepted. Everything else passes straight through, so the returned
// shape ({ data, error, count, status, statusText }) is byte-identical
// and no caller behaviour changes. Verified against
// PostgrestQueryBuilder before adopting: chaining, awaiting and the
// result shape all survive the proxy.
//
// This REPORTS, it never throws. A reporting layer that can break a
// page is worse than the silence it replaces.

type QueryResult = { error?: unknown; data?: unknown } | null | undefined;

export interface QueryFault {
  context: string;
  table:   string;
  code?:   string;
  message: string;
  details?: string;
  hint?:   string;
}

/** Overridable so tests can assert what was reported without a network. */
let sink: (fault: QueryFault) => void = defaultSink;

export function setQueryFaultSink(fn: (fault: QueryFault) => void) { sink = fn; }
export function resetQueryFaultSink() { sink = defaultSink; }

function defaultSink(fault: QueryFault) {
  // Structured so it is greppable in any log drain, matching the
  // {_audit:true} convention the cron routes already use.
  console.error(JSON.stringify({ _audit: true, action: 'supabase.query.failed', ...fault }));

  // Sentry is a no-op without a DSN, so this costs nothing locally.
  try {
    // Imported lazily: this module is pulled into browser bundles and
    // the static import would drag Sentry in even when unconfigured.
    const Sentry = (globalThis as any).__SENTRY__
      ? require('@sentry/nextjs')
      : null;
    if (Sentry?.captureMessage) {
      Sentry.captureMessage(`Supabase query failed: ${fault.table}`, {
        level: 'error',
        tags:  { context: fault.context, table: fault.table, pg_code: fault.code },
        extra: fault,
      });
    }
  } catch {
    // Never let reporting break the request.
  }
}

function report(context: string, table: string, error: any) {
  try {
    sink({
      context,
      table,
      code:    error?.code,
      message: String(error?.message ?? error ?? 'unknown error'),
      details: error?.details,
      hint:    error?.hint,
    });
  } catch {
    /* reporting must never throw */
  }
}

function wrapBuilder(builder: any, context: string, table: string): any {
  if (!builder || typeof builder !== 'object') return builder;

  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // The one interception: inspect the resolved value on its way past.
      if (prop === 'then') {
        return (onFulfilled: any, onRejected: any) =>
          target.then(
            (result: QueryResult) => {
              if (result?.error) report(context, table, result.error);
              return onFulfilled ? onFulfilled(result) : result;
            },
            onRejected,
          );
      }

      if (typeof value === 'function') {
        return (...args: any[]) => {
          const out = value.apply(target, args);
          // A chainable method returns a builder (sometimes `this`).
          // Keep it wrapped so the chain stays instrumented to the end.
          if (out === target) return receiver;
          if (out && typeof out === 'object' && typeof (out as any).then === 'function') {
            return wrapBuilder(out, context, table);
          }
          return out;
        };
      }

      return value;
    },
  });
}

/** Wrap a Supabase client so every failed query is reported.
 *
 *  `context` names the surface for the log line — 'admin:server',
 *  'portal:browser', 'cron:referral-scan'. Without it a fault says what
 *  broke but not where, which is half an answer. */
export function instrumentSupabase<T extends Record<string, any>>(client: T, context: string): T {
  const originalFrom = typeof client.from === 'function' ? client.from.bind(client) : null;
  const originalRpc  = typeof client.rpc  === 'function' ? client.rpc.bind(client)  : null;

  if (originalFrom) {
    Object.defineProperty(client, 'from', {
      configurable: true,
      writable: true,
      value: (table: string, ...rest: any[]) =>
        wrapBuilder(originalFrom(table, ...rest), context, table),
    });
  }

  if (originalRpc) {
    Object.defineProperty(client, 'rpc', {
      configurable: true,
      writable: true,
      value: (fn: string, ...rest: any[]) =>
        wrapBuilder(originalRpc(fn, ...rest), context, `rpc:${fn}`),
    });
  }

  return client;
}
