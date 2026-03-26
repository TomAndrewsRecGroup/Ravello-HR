// ─── Manatal ATS API Client ────────────────────────────────────────────────
// Proxy to Manatal Open API. Set MANATAL_API_KEY and MANATAL_API_URL in Vercel.
// Manatal docs: https://developers.manatal.com/reference
//
// Key endpoints used:
//   GET /jobs           — list job postings
//   GET /pipeline       — candidate pipeline stages
//   GET /applications   — applications/candidates per job
//
// All filtered by department_id = company.manatal_client_id

const API_KEY = process.env.MANATAL_API_KEY ?? '';
const API_URL = process.env.MANATAL_API_URL ?? 'https://api.manatal.com/open/v1';

export interface ManatalJob {
  id:           number;
  name:         string;            // job title
  status:       string;            // 'open' | 'filled' | 'closed' | 'draft'
  department:   { id: number; name: string } | null;
  location:     string | null;
  employment_type: string | null;
  created_at:   string;
  updated_at:   string;
}

export interface ManatalApplication {
  id:              number;
  candidate:       { id: number; first_name: string; last_name: string; email: string };
  job:             { id: number; name: string };
  stage:           string;         // pipeline stage name
  stage_id:        number;
  created_at:      string;
}

async function manatalFetch(path: string, params?: Record<string, string>): Promise<any> {
  if (!API_KEY) return null;

  const url = new URL(`${API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type':  'application/json',
      },
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

export async function getManatalJobs(departmentId: string): Promise<ManatalJob[]> {
  const data = await manatalFetch('/jobs/', { department_id: departmentId, status: 'open', limit: '100' });
  return (data?.results ?? data ?? []) as ManatalJob[];
}

export async function getManatalApplications(departmentId: string, stages?: string[]): Promise<ManatalApplication[]> {
  // Fetch applications filtered by department; optionally filter to specific pipeline stages
  const data = await manatalFetch('/applications/', { department_id: departmentId, limit: '200' });
  const all  = (data?.results ?? data ?? []) as ManatalApplication[];

  if (!stages?.length) return all;

  // Filter to submission+ stages (Submission, Interview, Offer, etc.)
  const submissionStages = stages ?? ['Submission', 'Phone Screen', 'Interview', 'Offer', 'Hired', 'Rejected'];
  return all.filter((a: ManatalApplication) =>
    submissionStages.some(s => a.stage?.toLowerCase().includes(s.toLowerCase()))
  );
}

export function isManatalConfigured(): boolean {
  return Boolean(API_KEY);
}
