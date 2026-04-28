// Shared aggregation that builds the IvylensHealth payload from the
// telemetry tables. Used by both the /health page (initial render) and
// the /api/ivylens/probe endpoint (so a successful probe can return
// the freshly-recomputed numbers and the UI cards update without
// waiting for ISR).

import type { SupabaseClient } from '@supabase/supabase-js';

const RATE_LIMIT_PER_DAY = 1000;

export interface IvylensHealth {
  configured:          boolean;
  calls_last_24h:      number;
  rate_limit_headroom: number;
  errors_last_24h:     number;
  p50_latency_ms:      number | null;
  last_call_at:        string | null;
  last_status:         number | null;
  cache_entries:       number;
  oldest_cache_at:     string | null;
  rate_limited_hits:   number;
}

interface CallRow {
  status:       number;
  duration_ms:  number;
  rate_limited: boolean;
  called_at:    string;
}
interface CacheRow {
  fetched_at: string;
  expires_at: string;
}

export async function computeIvylensHealth(supabase: SupabaseClient): Promise<IvylensHealth> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [callsRes, cacheRes] = await Promise.all([
    supabase
      .from('ivylens_api_calls')
      .select('status,duration_ms,rate_limited,called_at')
      .gte('called_at', dayAgo)
      .order('called_at', { ascending: false }),
    supabase
      .from('ivylens_cache')
      .select('fetched_at,expires_at')
      .order('fetched_at', { ascending: true }),
  ]);

  const calls = (callsRes.data ?? []) as CallRow[];
  const cache = (cacheRes.data ?? []) as CacheRow[];

  const errors = calls.filter(c => c.status >= 400 && !c.rate_limited).length;
  const rateLimitedCalls = calls.filter(c => c.rate_limited).length;
  const sortedLatencies  = calls.map(c => c.duration_ms).sort((a, b) => a - b);
  const p50Latency       = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length / 2)] : null;
  const headroom = Math.max(0, Math.min(100, Math.round((1 - calls.length / RATE_LIMIT_PER_DAY) * 100)));

  return {
    configured:        Boolean(process.env.IVYLENS_API_URL),
    calls_last_24h:    calls.length,
    rate_limit_headroom: headroom,
    errors_last_24h:   errors,
    p50_latency_ms:    p50Latency,
    last_call_at:      calls[0]?.called_at ?? null,
    last_status:       calls[0]?.status ?? null,
    cache_entries:     cache.length,
    oldest_cache_at:   cache[0]?.fetched_at ?? null,
    rate_limited_hits: rateLimitedCalls,
  };
}
