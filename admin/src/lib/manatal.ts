// ─── Manatal ATS API client (admin) ────────────────────────────────────────
// Auth: token in MANATAL_API_KEY env var.
//
// Two base URLs in play:
//   READ_API_URL  (env MANATAL_API_URL, default /open/v1) — the existing
//                  portal pipeline reads (/jobs/?department_id=…,
//                  /pipeline/, /matches/) target v1 and keep working.
//   WRITE_API_URL (hardcoded /open/v3) — new admin write surface
//                  (organizations, jobs, publish). v3 is the only
//                  version Manatal documents these write shapes for.
//
// Docs: https://developers.manatal.com/reference
//
// Failure mode is best-effort, matching the lib/email pattern:
//   - functions return null on failure (network, 4xx/5xx, bad json)
//   - the last error is captured for the caller to surface via
//     lastManatalError() (mirrors lastEmailError() in lib/email).

const API_KEY       = process.env.MANATAL_API_KEY ?? '';
const READ_API_URL  = process.env.MANATAL_API_URL ?? 'https://api.manatal.com/open/v1';
const WRITE_API_URL = 'https://api.manatal.com/open/v3';

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
  options?: { method?: string; body?: unknown; baseUrl?: string },
): Promise<any> {
  if (!API_KEY) {
    lastError = { status: 0, message: 'MANATAL_API_KEY not configured', path };
    return null;
  }

  const base = options?.baseUrl ?? READ_API_URL;
  const url = new URL(`${base}${path}`);
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

/* ─── Write surface — orgs + jobs (Manatal Open API v3) ─── */

export interface CreateOrganizationArgs {
  name:         string;
  /** TPS company UUID — stored on Manatal as `external_id` so we
   *  can look the org up by our own id later. Doubles as our
   *  "this org belongs to TPS" marker. */
  externalId?:  string;
  description?: string;
  website?:     string;
  address?:     string;
}

/** POST /organizations/ on Manatal Open API v3.
 *  Manatal organizations have no `industry` or `country` fields,
 *  so we stamp `description: 'TPS-managed client'` + `external_id`
 *  with our company UUID so every TPS org is identifiable upstream.
 *  Returns the organization id Manatal assigned, or null on failure
 *  (with reason on lastManatalError()). */
export async function createManatalOrganization(
  args: CreateOrganizationArgs,
): Promise<{ id: string } | null> {
  const data = await manatalFetch('/organizations/', undefined, {
    method:  'POST',
    baseUrl: WRITE_API_URL,
    body: {
      name:        args.name,
      external_id: args.externalId ?? null,
      description: args.description ?? 'TPS-managed client',
      website:     args.website ?? '',
      address:     args.address ?? '',
    },
  });
  if (!data?.id) return null;
  return { id: String(data.id) };
}

export type ManatalContractDetails =
  | 'full_time' | 'part_time' | 'temporary' | 'freelance'
  | 'internship' | 'apprenticeship' | 'contractor' | 'consultancy';

export interface CreateJobArgs {
  organizationId:   string;
  title:            string;
  description?:     string | null;
  address?:         string | null;   // free-text office address
  city?:            string | null;
  state?:           string | null;
  country?:         string | null;
  isRemote?:        boolean | null;
  contractDetails?: ManatalContractDetails | null;
  salaryMin?:       number | null;
  salaryMax?:       number | null;
  currency?:        string | null;   // ISO-3 e.g. 'GBP'
  /** External id to round-trip the requisition's UUID. */
  externalId?:      string | null;
  headcount?:       number | null;
}

/** POST /jobs/ on Manatal Open API v3.
 *
 *  Required fields per the v3 schema: `organization` (FK integer)
 *  and `position_name` (string). Job is created with status='active'
 *  + is_published=false; flip via publishManatalJob() when ready.
 *
 *  Note: Manatal stores ids as integers. We coerce organizationId
 *  (TEXT on our side) back to Number. Salary fields are decimal
 *  strings on Manatal (`format: decimal` + `type: string`). */
export async function createManatalJob(
  args: CreateJobArgs,
): Promise<{ id: string } | null> {
  const orgIdNum = Number(args.organizationId);
  if (!Number.isFinite(orgIdNum)) {
    lastError = { status: 0, message: `organizationId is not numeric: ${args.organizationId}`, path: '/jobs/' };
    return null;
  }
  const data = await manatalFetch('/jobs/', undefined, {
    method:  'POST',
    baseUrl: WRITE_API_URL,
    body: {
      organization:     orgIdNum,
      position_name:    args.title,
      description:      args.description ?? '',
      external_id:      args.externalId ?? null,
      address:          args.address ?? '',
      city:             args.city ?? '',
      state:            args.state ?? '',
      country:          args.country ?? '',
      is_remote:        args.isRemote ?? null,
      contract_details: args.contractDetails ?? null,
      salary_min:       args.salaryMin != null ? String(args.salaryMin) : null,
      salary_max:       args.salaryMax != null ? String(args.salaryMax) : null,
      currency:         args.currency ?? null,
      headcount:        args.headcount ?? null,
      status:           'active',
      is_published:     false,
    },
  });
  if (!data?.id) return null;
  return { id: String(data.id) };
}

/** PATCH /jobs/{id}/ on Manatal Open API v3 to flip a job live on
 *  the Manatal Careers page (and pin it). Manatal's free-job-board
 *  syndication isn't an API toggle — it's a Manatal-side automatic
 *  behaviour for published jobs.
 *
 *  Returns true when manatalFetch reported a successful response
 *  (covers 200 with body, 204 No Content, and 2xx with empty body —
 *  all are treated as success in the helper). false means the API
 *  responded non-2xx or the network failed; the reason is on
 *  lastManatalError(). */
export async function publishManatalJob(jobId: string): Promise<boolean> {
  const data = await manatalFetch(`/jobs/${jobId}/`, undefined, {
    method:  'PATCH',
    baseUrl: WRITE_API_URL,
    body: {
      status:                  'active',
      is_published:            true,
      is_pinned_in_career_page: true,
    },
  });
  return data !== null;
}

/* ─── Config check ────────────────────────────────── */

export function isManatalConfigured(): boolean {
  return Boolean(API_KEY);
}
