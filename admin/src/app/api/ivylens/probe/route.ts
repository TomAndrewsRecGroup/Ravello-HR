// GET /api/ivylens/probe
//
// One-shot connection probe. Intended to be triggered from the
// Intelligence > Health page so admins can verify the live IvyLens
// integration end-to-end without having to wait for organic traffic
// to populate the telemetry tables.
//
// Behaviour:
//   - tps_admin only.
//   - Reports which env vars are set (without leaking secret values).
//   - If env is fully configured, fires a tiny live request to
//     IvyLens (`/bd/leads?limit=1`) and reports latency + status.
//   - The shared ivylensRequest helper records the call into
//     ivylens_api_calls automatically. We AWAIT that telemetry write
//     before recomputing the aggregate so the freshly-returned `health`
//     payload reflects the call we just made — the UI cards on the
//     /health page can swap to those numbers immediately, no ISR wait.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { ivylensRequest } from '@/lib/ivylens';
import { computeIvylensHealth, type IvylensHealth } from '@/lib/ivylens/health';

export const runtime = 'nodejs';

interface ProbeBase {
  ok: boolean;
  stage: 'env' | 'live' | 'rate_limited' | 'upstream';
  env: { IVYLENS_API_URL: boolean; IVYLENS_API_KEY: boolean; apiHost: string | null };
  message: string;
  /** Recomputed telemetry aggregate after this call landed. Lets the
   *  UI cards bypass the page-level ISR. */
  health?: IvylensHealth;
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const apiUrl   = process.env.IVYLENS_API_URL ?? '';
  const hasUrl   = apiUrl.length > 0;
  const hasKey   = (process.env.IVYLENS_API_KEY ?? '').length > 0;
  const apiHost  = hasUrl ? safeHost(apiUrl) : null;
  const supabase = createServerSupabaseClient();

  if (!hasUrl) {
    return NextResponse.json<ProbeBase>({
      ok: false,
      stage: 'env',
      env: { IVYLENS_API_URL: false, IVYLENS_API_KEY: hasKey, apiHost },
      message:
        'IVYLENS_API_URL is not set. Add it (and IVYLENS_API_KEY) to the admin app environment in Vercel, then redeploy or hit this endpoint again.',
      // Even on env-miss, return whatever telemetry we have so the
      // cards stay in sync with the DB rather than showing zeros from
      // a stale ISR cache.
      health: await computeIvylensHealth(supabase),
    }, { status: 503 });
  }

  // Single retry only — this is a UI-driven probe, we don't want the
  // user staring at the spinner for the full 3-attempt backoff.
  const started = Date.now();
  const res = await ivylensRequest<{ leads?: unknown[]; total?: number }>(
    '/bd/leads?limit=1',
    { retries: 1, timeout: 8_000 },
  );
  const elapsed = Date.now() - started;

  // Wait for the telemetry insert to land before we read the table
  // back; without this the recomputed counts would lag by one call.
  await res.telemetry?.catch(() => {});
  const health = await computeIvylensHealth(supabase);

  if (res.data) {
    return NextResponse.json({
      ok: true,
      stage: 'live',
      env: { IVYLENS_API_URL: true, IVYLENS_API_KEY: hasKey, apiHost },
      status: res.status,
      latency_ms: elapsed,
      sample_total: res.data.total ?? null,
      message: hasKey
        ? `Connected to ${apiHost} via partner endpoint.`
        : `Connected to ${apiHost} (no API key — using public endpoint).`,
      health,
    });
  }

  return NextResponse.json({
    ok: false,
    stage: res.rate_limited ? 'rate_limited' : 'upstream',
    env: { IVYLENS_API_URL: true, IVYLENS_API_KEY: hasKey, apiHost },
    status: res.status,
    latency_ms: elapsed,
    error: res.error,
    message:
      res.rate_limited
        ? 'IvyLens replied 429 (rate limited). Cached results will be served until the window resets.'
        : `IvyLens responded ${res.status || '?'}: ${res.error ?? 'unknown error'}.`,
    health,
  }, { status: res.status >= 400 ? res.status : 502 });
}

// Pull just the host out of the URL so we can show it in the UI
// without leaking any path/secret in the env value.
function safeHost(raw: string): string | null {
  try { return new URL(raw).host; } catch { return null; }
}
