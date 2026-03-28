// ─── IvyLens API Client (Admin) ─────────────────────────────────────────────
// Shared helper for calling IvyLens partner endpoints from server-side routes.

const API_URL = process.env.IVYLENS_API_URL ?? '';
const API_KEY = process.env.IVYLENS_API_KEY ?? '';

interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: any;
  timeout?: number;
}

export async function ivylensRequest<T = any>(
  path: string,
  opts: FetchOptions = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { method = 'GET', body, timeout = 20_000 } = opts;

  if (!API_URL) {
    return { data: null, error: 'IVYLENS_API_URL not configured', status: 503 };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const url = API_KEY ? `${API_URL}/api/partner${path}` : `${API_URL}/api${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
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
