// ─── IvyLens API Client (Admin) ─────────────────────────────────────────────
// Shared helper for calling IvyLens partner endpoints from server-side routes.
// Handles: Bearer auth, partner prefix, 5xx retry with exponential backoff,
// 429 handling (caller can fall back to stale cache), request timeouts.

import { createClient } from '@supabase/supabase-js';

const API_URL = process.env.IVYLENS_API_URL ?? '';
const API_KEY = process.env.IVYLENS_API_KEY ?? '';

interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: any;
  timeout?: number;
  retries?: number;
}

export interface IvylensResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
  rate_limited?: boolean;
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

export async function ivylensRequest<T = any>(
  path: string,
  opts: FetchOptions = {},
): Promise<IvylensResponse<T>> {
  const { method = 'GET', body, timeout = 20_000, retries = 3 } = opts;

  if (!API_URL) {
    return { data: null, error: 'IVYLENS_API_URL not configured', status: 503 };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const url = API_KEY ? `${API_URL}/api/partner${path}` : `${API_URL}/api${path}`;

  let lastError = 'Network error';
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok) {
        return { data: await res.json() as T, error: null, status: res.status };
      }

      lastStatus = res.status;
      lastError  = (await res.text().catch(() => '')) || `HTTP ${res.status}`;

      // 429 — signal rate-limited so caller can use stale cache
      if (res.status === 429) {
        return { data: null, error: lastError, status: 429, rate_limited: true };
      }

      // 5xx — retry with exponential backoff (2s, 4s, 8s)
      if (res.status >= 500 && attempt < retries) {
        await sleep(2_000 * Math.pow(2, attempt));
        continue;
      }

      // 4xx other than 429 — no retry
      return { data: null, error: lastError, status: res.status };
    } catch (err: any) {
      lastError = err?.message ?? 'Network error';
      if (attempt < retries) {
        await sleep(2_000 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  return { data: null, error: lastError, status: lastStatus };
}

// ─── Cache helpers ──────────────────────────────────────────────────────────
// ivylens_cache is admin-visible via RLS (is_tps_staff). On the server we use
// the service role key so cache reads/writes work regardless of who's hitting
// the proxy route.

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface CacheLookup<T> {
  payload: T | null;
  fetched_at: string | null;
  stale: boolean;  // true if expired
  missing: boolean; // true if no row at all
}

export async function readCache<T = any>(key: string): Promise<CacheLookup<T>> {
  const sb = serviceClient();
  if (!sb) return { payload: null, fetched_at: null, stale: true, missing: true };

  const { data } = await sb
    .from('ivylens_cache')
    .select('payload, fetched_at, expires_at')
    .eq('cache_key', key)
    .maybeSingle();

  if (!data) return { payload: null, fetched_at: null, stale: true, missing: true };

  const stale = new Date(data.expires_at).getTime() < Date.now();
  return {
    payload:    data.payload as T,
    fetched_at: data.fetched_at,
    stale,
    missing:    false,
  };
}

export async function writeCache(key: string, payload: any, ttlSeconds = 86_400): Promise<void> {
  const sb = serviceClient();
  if (!sb) return;

  const now  = new Date();
  const exp  = new Date(now.getTime() + ttlSeconds * 1000);

  await sb.from('ivylens_cache').upsert(
    { cache_key: key, payload, fetched_at: now.toISOString(), expires_at: exp.toISOString() },
    { onConflict: 'cache_key' },
  );
}
