// ─── Manatal ATS API Client ────────────────────────────────────────────────
// Proxy to Manatal Open API. Set MANATAL_API_KEY and MANATAL_API_URL in Vercel.
// Manatal docs: https://developers.manatal.com/reference
//
// Key endpoints used:
//   GET    /jobs/              — list job postings
//   GET    /pipeline/          — pipeline stage definitions
//   GET    /matches/           — candidate–job pairings (with stage)
//   PATCH  /matches/:id/       — move candidate to a different stage
//   GET    /applications/      — applications/candidates per job
//
// All filtered by department_id = company.manatal_client_id

const API_KEY = process.env.MANATAL_API_KEY ?? '';
const API_URL = process.env.MANATAL_API_URL ?? 'https://api.manatal.com/open/v1';

/* ─── Types ───────────────────────────────────────── */

export interface ManatalJob {
  id:              number;
  name:            string;            // job title
  status:          string;            // 'open' | 'filled' | 'closed' | 'draft'
  department:      { id: number; name: string } | null;
  location:        string | null;
  employment_type: string | null;
  created_at:      string;
  updated_at:      string;
}

export interface ManatalApplication {
  id:              number;
  candidate:       { id: number; first_name: string; last_name: string; email: string };
  job:             { id: number; name: string };
  stage:           string;         // pipeline stage name
  stage_id:        number;
  created_at:      string;
}

export interface ManatalStage {
  id:   number;
  name: string;
}

export interface ManatalMatch {
  id:           number;
  candidate:    { id: number; first_name: string; last_name: string; email: string; picture?: string };
  job:          { id: number; name: string };
  stage:        ManatalStage;
  is_active:    boolean;
  submitted_at: string | null;
  interview_at: string | null;
  offer_at:     string | null;
  hired_at:     string | null;
  dropped_at:   string | null;
  created_at:   string;
  updated_at:   string;
}

/* ─── Fetch helper ────────────────────────────────── */

async function manatalFetch(
  path: string,
  params?: Record<string, string>,
  options?: { method?: string; body?: unknown },
): Promise<any> {
  if (!API_KEY) return null;

  const url = new URL(`${API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      method:  options?.method ?? 'GET',
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type':  'application/json',
      },
      body:   options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn('[Manatal] API error', res.status, path);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[Manatal] fetch failed', err);
    return null;
  }
}

/* ─── Jobs ────────────────────────────────────────── */

export async function getManatalJobs(departmentId: string): Promise<ManatalJob[]> {
  const data = await manatalFetch('/jobs/', { department_id: departmentId, status: 'open', limit: '100' });
  return (data?.results ?? data ?? []) as ManatalJob[];
}

/* ─── Pipeline stages ─────────────────────────────── */

export async function getManatalStages(): Promise<ManatalStage[]> {
  const data = await manatalFetch('/pipeline/', { limit: '50' });
  return (data?.results ?? data ?? []) as ManatalStage[];
}

/* ─── Matches (candidate–job with stage) ──────────── */

export async function getManatalMatches(departmentId: string): Promise<ManatalMatch[]> {
  // Fetch all matches for this client in a single API call.
  // Manatal lists all jobs under one department_id (client),
  // so we can get all matches without per-job N+1 queries.
  const data = await manatalFetch('/matches/', { department_id: departmentId, limit: '500' });
  return (data?.results ?? data ?? []) as ManatalMatch[];
}

/* ─── Move candidate stage ────────────────────────── */

export async function updateMatchStage(matchId: number, stageId: number): Promise<ManatalMatch | null> {
  const data = await manatalFetch(`/matches/${matchId}/`, undefined, {
    method: 'PATCH',
    body:   { stage: { id: stageId } },
  });
  return data as ManatalMatch | null;
}

/* ─── Config check ────────────────────────────────── */

export function isManatalConfigured(): boolean {
  return Boolean(API_KEY);
}
