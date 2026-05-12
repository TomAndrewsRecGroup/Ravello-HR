// ─── Manatal ATS API client (admin) ────────────────────────────────────────
// Auth: token in MANATAL_API_KEY env var. Base URL via MANATAL_API_URL
// (defaults to https://api.manatal.com/open/v1).
// Docs: https://developers.manatal.com/reference
//
// Admin owns the WRITE surface:
//   POST  /organizations/   create a Manatal org per TPS client (industry: 'TPS')
//   POST  /jobs/            create a job under that org from a requisition
//   PATCH /jobs/:id/        publish the job to Careers page + free boards
//
// Read helpers (jobs, stages, matches) are mirrored from
// portal/src/lib/manatal.ts so admin-side surfaces (future v2
// candidate review) don't have to depend on the portal package.
//
// Failure mode is best-effort, matching the lib/email pattern:
//   - functions return null on failure (network, 4xx/5xx, bad json)
//   - the last error is captured for the caller to surface via
//     lastManatalError() (mirrors lastEmailError() in lib/email).

const API_KEY = process.env.MANATAL_API_KEY ?? '';
const API_URL = process.env.MANATAL_API_URL ?? 'https://api.manatal.com/open/v1';

/* ─── Last error capture ──────────────────────────── */

let lastError: { status: number; message: string; path: string } | null = null;
export function lastManatalError() { return lastError; }

/* ─── Types ───────────────────────────────────────── */

export interface ManatalJob {
  id:              number;
  name:            string;
  status:          string;            // 'open' | 'filled' | 'closed' | 'draft'
  department:      { id: number; name: string } | null;
  location:        string | null;
  employment_type: string | null;
  created_at:      string;
  updated_at:      string;
}

export interface ManatalStage { id: number; name: string }

export interface ManatalMatch {
  id:           number;
  candidate:    { id: number; first_name: string; last_name: string; email: string; picture?: string };
  job:          { id: number; name: string };
  stage:        ManatalStage;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
}

/* ─── Fetch helper ────────────────────────────────── */

async function manatalFetch(
  path: string,
  params?: Record<string, string>,
  options?: { method?: string; body?: unknown },
): Promise<any> {
  if (!API_KEY) {
    lastError = { status: 0, message: 'MANATAL_API_KEY not configured', path };
    return null;
  }

  const url = new URL(`${API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const method = options?.method ?? 'GET';
  const cacheConfig = method === 'GET' ? { next: { revalidate: 60 } } : { cache: 'no-store' as const };

  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type':  'application/json',
      },
      body:   options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
      ...cacheConfig,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let parsedMessage = body;
      try {
        const parsed = JSON.parse(body);
        parsedMessage = parsed.detail ?? parsed.message ?? parsed.error ?? body;
      } catch { /* leave raw */ }
      lastError = { status: res.status, message: parsedMessage, path };
      console.warn('[Manatal] API error', { status: res.status, path, body });
      return null;
    }
    lastError = null;
    // 204 No Content (common on PATCH/DELETE) and any other empty
    // body would throw inside res.json(). Treat the empty case as a
    // successful response with an empty object so callers that only
    // care about success vs failure don't get false negatives.
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return {};
    }
    const raw = await res.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      // Manatal returned 2xx with a non-JSON body — count as success
      // (the operation went through) but log so we can see what they
      // sent.
      console.warn('[Manatal] non-JSON success body', { path, raw: raw.slice(0, 200) });
      return {};
    }
  } catch (err) {
    lastError = { status: 0, message: (err as Error)?.message ?? 'transport error', path };
    console.warn('[Manatal] fetch failed', err);
    return null;
  }
}

/* ─── Read surface (mirrors portal) ───────────────── */

export async function getManatalJobs(organizationId: string): Promise<ManatalJob[]> {
  const data = await manatalFetch('/jobs/', { department_id: organizationId, status: 'open', limit: '100' });
  return (data?.results ?? data ?? []) as ManatalJob[];
}

export async function getManatalStages(): Promise<ManatalStage[]> {
  const data = await manatalFetch('/pipeline/', { limit: '50' });
  return (data?.results ?? data ?? []) as ManatalStage[];
}

export async function getManatalMatches(organizationId: string): Promise<ManatalMatch[]> {
  const data = await manatalFetch('/matches/', { department_id: organizationId, limit: '500' });
  return (data?.results ?? data ?? []) as ManatalMatch[];
}

export async function updateMatchStage(matchId: number, stageId: number): Promise<ManatalMatch | null> {
  const data = await manatalFetch(`/matches/${matchId}/`, undefined, {
    method: 'PATCH',
    body:   { stage: { id: stageId } },
  });
  return data as ManatalMatch | null;
}

/* ─── Write surface — orgs + jobs ─────────────────── */

export interface CreateOrganizationArgs {
  name:       string;
  industry?:  string;   // tagged 'TPS' for every TPS-managed client
  country?:   string;   // ISO-2 (e.g. 'GB')
  website?:   string;
}

/** Creates a Manatal organization (one per TPS client). The exact
 *  payload field names are taken from Manatal's REST docs; any
 *  rename only needs to touch this function. Returns the organization
 *  id Manatal assigned, or null on failure (with reason on
 *  lastManatalError()). */
export async function createManatalOrganization(
  args: CreateOrganizationArgs,
): Promise<{ id: string } | null> {
  const data = await manatalFetch('/organizations/', undefined, {
    method: 'POST',
    body: {
      name:     args.name,
      industry: args.industry ?? null,
      country:  args.country ?? null,
      website:  args.website ?? null,
    },
  });
  if (!data?.id) return null;
  return { id: String(data.id) };
}

export interface CreateJobArgs {
  organizationId:  string;
  title:           string;
  description?:    string | null;
  location?:       string | null;
  employmentType?: string | null;
  salaryMin?:      number | null;
  salaryMax?:      number | null;
  salaryCurrency?: string | null;
  seniority?:      string | null;
}

/** Creates a Manatal job inside the supplied organization. Created
 *  in 'draft' status — call publishManatalJob() afterwards to flip
 *  it live to the Careers page + free job board syndication.
 *
 *  Note: Manatal stores ids as integers. We store them as TEXT on
 *  our side (companies.manatal_client_id, requisitions.manatal_job_id)
 *  for flexibility but coerce back to Number on outbound writes —
 *  Manatal validators reject string ids in body fields. */
export async function createManatalJob(
  args: CreateJobArgs,
): Promise<{ id: string } | null> {
  const orgIdNum = Number(args.organizationId);
  if (!Number.isFinite(orgIdNum)) {
    lastError = { status: 0, message: `organizationId is not numeric: ${args.organizationId}`, path: '/jobs/' };
    return null;
  }
  const data = await manatalFetch('/jobs/', undefined, {
    method: 'POST',
    body: {
      name:             args.title,
      department:       orgIdNum,
      description:      args.description ?? null,
      location:         args.location ?? null,
      employment_type:  args.employmentType ?? null,
      salary_min:       args.salaryMin ?? null,
      salary_max:       args.salaryMax ?? null,
      salary_currency:  args.salaryCurrency ?? 'GBP',
      seniority:        args.seniority ?? null,
      status:           'draft',
    },
  });
  if (!data?.id) return null;
  return { id: String(data.id) };
}

/** Toggles a Manatal job live. Sets status to 'open', publishes to
 *  the Manatal Careers page, and enables free-job-board syndication
 *  flags. Manatal's actual flag names are isolated here so any
 *  schema change is a one-line edit.
 *
 *  Returns true when manatalFetch reported a successful response
 *  (covers 200 with body, 204 No Content, and 2xx with empty body —
 *  all are treated as success in the helper). false means the API
 *  responded non-2xx or the network failed; the reason is on
 *  lastManatalError(). */
export async function publishManatalJob(jobId: string): Promise<boolean> {
  const data = await manatalFetch(`/jobs/${jobId}/`, undefined, {
    method: 'PATCH',
    body: {
      status:                 'open',
      published_on_careers:   true,
      published_on_free_jobs: true,
    },
  });
  return data !== null;
}

/* ─── Config check ────────────────────────────────── */

export function isManatalConfigured(): boolean {
  return Boolean(API_KEY);
}
