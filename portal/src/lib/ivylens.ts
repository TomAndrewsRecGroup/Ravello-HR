// ─── IvyLens API Client ─────────────────────────────────────────────────────
// Shared helper for calling IvyLens partner endpoints from server-side routes.

const API_URL = process.env.IVYLENS_API_URL ?? '';
const API_KEY = process.env.IVYLENS_API_KEY ?? '';

interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: any;
  timeout?: number;
  /**
   * Override Next's fetch cache TTL for this call (seconds).
   * Default: 60s for GETs, no-store for POSTs. Pass 0 to opt out of cache.
   */
  revalidate?: number;
}

export async function ivylensRequest<T = any>(
  path: string,
  opts: FetchOptions = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { method = 'GET', body, timeout = 20_000, revalidate } = opts;

  if (!API_URL) {
    return { data: null, error: 'IVYLENS_API_URL not configured', status: 503 };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  // Use partner routes when API key is present
  const url = API_KEY ? `${API_URL}/api/partner${path}` : `${API_URL}/api${path}`;

  // GETs: cache via Next's fetch cache (default 60s) so repeated hits within
  // the same window deduplicate at the framework layer. Per-tenant filtering
  // happens in the route handler after the IvyLens call returns, so this is
  // safe — the API_KEY is shared across the partner workspace.
  // POSTs: never cache.
  const cacheConfig =
    method === 'GET'
      ? revalidate === 0
        ? { cache: 'no-store' as const }
        : { next: { revalidate: revalidate ?? 60 } }
      : { cache: 'no-store' as const };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
      ...cacheConfig,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { data: null, error: text || `HTTP ${res.status}`, status: res.status };
    }

    const data = await res.json();
    return { data, error: null, status: res.status };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Network error', status: 0 };
  }
}
