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

import { resilientFetch } from './http/resilient';

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

/**
 * Manatal returns a related object EITHER expanded OR as a bare id,
 * and which one you get depends on the API version.
 *
 * Measured against the live account on 2026-08-26:
 *   /open/v1/matches/  → "candidate": { id, first_name, … }
 *   /open/v3/matches/  → "candidate": 161626806
 *
 * The referral pipeline reads v3 and the portal's pipeline board reads
 * v1, so both shapes are live in this codebase at the same time. Read
 * an id with `manatalRefId()` and never with `.candidate?.id` — on the
 * v3 shape that is `undefined`, which silently discards every match.
 */
export type ManatalRef<T> = number | string | T;

export interface ManatalMatchCandidate {
  id: number; first_name: string; last_name: string; email: string; picture?: string;
}

/**
 * The id of a related record, whichever shape it arrived in.
 * Returns '' when there genuinely is none, so callers can test falsy.
 */
export function manatalRefId(ref: ManatalRef<{ id?: number | string }> | null | undefined): string {
  if (ref === null || ref === undefined) return '';
  if (typeof ref === 'number' || typeof ref === 'string') return String(ref);
  return ref.id === null || ref.id === undefined ? '' : String(ref.id);
}

export interface ManatalMatch {
  id:           number;
  candidate:    ManatalRef<ManatalMatchCandidate>;
  job:          ManatalRef<{ id: number; name: string }>;
  stage:        ManatalStage;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
  /** The Manatal user who attached this candidate to the job, or null
   *  when nobody did — i.e. the candidate applied through a job board or
   *  the careers page. See isJobBoardApplicant(). */
  creator?:     number | string | null;
}

/**
 * Did this candidate APPLY, or did a recruiter put them on the job?
 *
 * Measured against the live account on 2026-08-28, job 4324606:
 * seven matches, three with `creator: null` (Adzuna applicants, arriving
 * with `source_details.channel = "free_job_board"`) and four with
 * `creator: 1120238` — the operator's own Manatal user id, candidates
 * they had sourced and attached by hand.
 *
 * The distinction is load-bearing for the referral pipeline: it exists
 * to pass job-board applicants ON to a partner. Doing that to a
 * candidate the operator sourced themselves would email their own
 * shortlist a competitor's referral link.
 *
 * Deliberately NOT keyed on `is_active` or `dropped_at`. A rejected
 * applicant is the single best referral candidate there is — that is the
 * whole point of the feature.
 */
export function isJobBoardApplicant(match: ManatalMatch): boolean {
  return match.creator === null || match.creator === undefined;
}

/* ─── Fetch helper ────────────────────────────────── */

async function manatalFetch(
  path: string,
  params?: Record<string, string>,
  options?: { method?: string; body?: unknown; baseUrl?: string; noCache?: boolean; timeoutMs?: number; deadline?: number },
): Promise<any> {
  if (!API_KEY) {
    lastError = { status: 0, message: 'MANATAL_API_KEY not configured', path };
    return null;
  }

  const base = options?.baseUrl ?? READ_API_URL;
  const url = new URL(`${base}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const method = options?.method ?? 'GET';
  // GETs are cached for a minute by default, which suits the portal's
  // pipeline view. Background jobs MUST pass noCache: a cached
  // candidate payload can serve an already-expired presigned resume
  // URL, and a 403 on that link is indistinguishable from a CV with
  // nothing in it. See getManatalCandidate below.
  const cacheConfig = method === 'GET' && !options?.noCache
    ? { next: { revalidate: 60 } }
    : { cache: 'no-store' as const };

  // Retried with jittered backoff and a per-vendor circuit breaker.
  // Before this there was no retry at all: one 10s timeout and the call
  // returned null, which the referral pipeline recorded as a scan error.
  // A single transient 502 cost a candidate their referral.
  //
  // Writes (POST/PATCH) are NOT retried — a timed-out POST may have
  // succeeded with the response lost, and repeating it would create a
  // second job or a second organisation.
  const { response: res, error: transportError } = await resilientFetch(
    url.toString(),
    {
      method,
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      ...cacheConfig,
    } as RequestInit,
    {
      vendor:    'manatal',
      timeoutMs: options?.timeoutMs ?? 15_000,
      deadline:  options?.deadline,
    },
  );

  try {
    if (!res) {
      lastError = { status: 0, message: transportError ?? 'transport error', path };
      console.warn('[Manatal] call failed', { path, error: transportError });
      return null;
    }
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
    // resilientFetch never throws, so this now only guards body reading.
    lastError = { status: 0, message: (err as Error)?.message ?? 'response read error', path };
    console.warn('[Manatal] response read failed', err);
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

/* ─── Candidate read surface (Manatal Open API v3) ───────── */
//
// The referral pipeline (admin/src/app/api/cron/referral-scan) reads
// job-board applicants through here. v3 is required: the v1 candidate
// payload omits `resume`, the parsed `skills[]` and `candidate_location`,
// which are the three fields the scan depends on.
//
// Every function below passes noCache. These are background reads and
// a stale payload is worse than a slow one — see getManatalCandidate.

export interface ManatalCandidateSkill {
  skill:      number;
  skill_name: string;
  score:      number;
  source:     string;
}

export interface ManatalCandidate {
  id:                 number;
  external_id:        string | null;
  full_name:          string;
  email:              string | null;
  phone_number:       string | null;
  /** PRESIGNED CloudFront URL. Short-lived — see getManatalCandidate. */
  resume:             string | null;
  address:            string | null;
  /** Free text. Often a city with no country ("Ndola, Zambia",
   *  "United Kingdom", or just "Manchester"). The country gate must
   *  treat an unrecognised value as UNKNOWN, never as approved. */
  candidate_location: string | null;
  latest_degree:      string | null;
  latest_university:  string | null;
  current_company:    string | null;
  current_position:   string | null;
  description:        string | null;
  skills:             ManatalCandidateSkill[];
  candidate_tags:     unknown[];
  candidate_industries: unknown[];
  source_type:        string | null;
  /** Stamped by Manatal when the applicant submitted the application. */
  consent:            boolean | null;
  consent_date:       string | null;
  created_at:         string;
  updated_at:         string;
}

export interface ManatalExperience {
  id:           number;
  title:        string | null;
  company_name: string | null;
  description:  string | null;
  start_date:   string | null;
  end_date:     string | null;
}

export interface ManatalEducation {
  id:           number;
  degree:       string | null;
  school_name:  string | null;
  field_of_study: string | null;
  start_date:   string | null;
  end_date:     string | null;
}

/** GET /candidates/{id}/ — the ONLY source of a usable `resume` URL.
 *
 *  ⚠ `resume` is a presigned CloudFront link whose signature expires
 *  roughly ONE HOUR after this call. Measured against the live account
 *  on 2026-08-26: Expires was 59 minutes ahead at read time.
 *
 *  So: fetch the PDF inside the same request that called this, and
 *  never persist the URL for later use. An expired link answers 403,
 *  and because CV text is only ever used as scan input, an unhandled
 *  403 does not look like an error — it looks like a candidate whose
 *  CV said nothing, and scores them accordingly. That is why
 *  buildScanText records which source it actually used.
 */
export async function getManatalCandidate(
  candidateId: string | number,
  opts?: { deadline?: number },
): Promise<ManatalCandidate | null> {
  const data = await manatalFetch(`/candidates/${candidateId}/`, undefined, {
    baseUrl:  WRITE_API_URL,
    noCache:  true,
    deadline: opts?.deadline,
  });
  if (!data?.id) return null;
  return data as ManatalCandidate;
}

/** GET /candidates/?created_at__gte=… — a page of recent applicants.
 *  Used for backfill and diagnostics; the cron drives off /matches/
 *  instead, because that is what ties an applicant to a job. */
export async function getManatalCandidatesSince(
  sinceIso: string,
  opts?: { pageSize?: number; page?: number },
): Promise<ManatalCandidate[]> {
  const params: Record<string, string> = {
    created_at__gte: sinceIso,
    page_size:       String(opts?.pageSize ?? 100),
  };
  if (opts?.page) params.page = String(opts.page);
  const data = await manatalFetch('/candidates/', params, {
    baseUrl: WRITE_API_URL,
    noCache: true,
  });
  return (data?.results ?? []) as ManatalCandidate[];
}

/** GET /matches/?job_id=… — every applicant attached to one job.
 *  This is the candidate→role link the pipeline runs on, so a role
 *  with no Manatal job id can never pull in applicants. */
/** Every match on a job, across pages.
 *
 *  This used to request ONE page of 200 and return it. Manatal orders
 *  `/matches/` deterministically, so a job with more than 200 applicants
 *  returned the same first 200 on every hourly run and applicant 201
 *  onwards was never seen — silently, since a short page and a full one
 *  look identical in the returned array. The stated goal is that every
 *  applicant is scanned, so the walk is exhaustive.
 *
 *  `maxPages` is a backstop against a pathological job rather than a
 *  business rule; hitting it is reported by the caller, not swallowed.
 */
export async function getManatalMatchesForJob(
  jobId: string,
  opts?: { pageSize?: number; deadline?: number; maxPages?: number },
): Promise<{ matches: ManatalMatch[]; truncated: boolean }> {
  const pageSize = opts?.pageSize ?? 200;
  const maxPages = opts?.maxPages ?? 25;   // 5,000 applicants on one role
  const out: ManatalMatch[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await manatalFetch('/matches/', {
      job_id:    jobId,
      page:      String(page),
      page_size: String(pageSize),
    }, { baseUrl: WRITE_API_URL, noCache: true, deadline: opts?.deadline });

    // A failed page returns null. Stop and report what we have rather
    // than treating a vendor error as "no more applicants" — the caller
    // must not record a partial read as a complete one.
    if (!data) return { matches: out, truncated: true };

    const results = (data.results ?? []) as ManatalMatch[];
    out.push(...results);

    if (!data.next || results.length === 0) return { matches: out, truncated: false };
  }

  return { matches: out, truncated: true };
}

/** Experience + education rows, used to thicken the fallback scan
 *  text when the CV PDF could not be read. Best-effort: an empty
 *  array degrades the blob, it does not fail the scan. */
export async function getManatalCandidateExperiences(candidateId: string | number): Promise<ManatalExperience[]> {
  const data = await manatalFetch(`/candidates/${candidateId}/experiences/`, { page_size: '50' }, {
    baseUrl: WRITE_API_URL,
    noCache: true,
  });
  return (data?.results ?? []) as ManatalExperience[];
}

export async function getManatalCandidateEducations(candidateId: string | number): Promise<ManatalEducation[]> {
  const data = await manatalFetch(`/candidates/${candidateId}/educations/`, { page_size: '50' }, {
    baseUrl: WRITE_API_URL,
    noCache: true,
  });
  return (data?.results ?? []) as ManatalEducation[];
}

/* ─── Write surface — orgs + jobs (Manatal Open API v3) ─── */

export interface CreateOrganizationArgs {
  name:          string;
  /** TPS company UUID — stored on Manatal as `external_id` so we
   *  can look the org up by our own id later. Doubles as our
   *  "this org belongs to TPS" marker. */
  externalId?:   string;
  description?:  string;
  website?:      string;
  address?:      string;
  /** Manatal custom_fields object — free-form per Manatal account.
   *  We use it to stamp the organisation's "Industry" (or whatever
   *  custom field key the account uses) as 'TPS' so every
   *  TPS-managed client is identifiable upstream. */
  customFields?: Record<string, unknown>;
}

/** POST /organizations/ on Manatal Open API v3.
 *  Manatal organizations have no `industry` or `country` fields,
 *  so we stamp `description: 'TPS-managed client'` + `external_id`
 *  with our company UUID, and `custom_fields[<key>] = 'TPS'` where
 *  <key> is whatever Manatal account custom field represents
 *  "client industry" (env override: MANATAL_ORG_INDUSTRY_FIELD,
 *  defaults to 'industry'; value via MANATAL_ORG_INDUSTRY, defaults
 *  to 'TPS'). Returns the organization id Manatal assigned, or
 *  null on failure (with reason on lastManatalError()). */
export async function createManatalOrganization(
  args: CreateOrganizationArgs,
): Promise<{ id: string } | null> {
  const industryField = process.env.MANATAL_ORG_INDUSTRY_FIELD ?? 'industry';
  const industryValue = process.env.MANATAL_ORG_INDUSTRY ?? 'TPS';
  const defaultCustom: Record<string, unknown> = industryValue
    ? { [industryField]: industryValue }
    : {};

  const data = await manatalFetch('/organizations/', undefined, {
    method:  'POST',
    baseUrl: WRITE_API_URL,
    body: {
      name:          args.name,
      external_id:   args.externalId ?? null,
      description:   args.description ?? 'TPS-managed client',
      website:       args.website ?? '',
      address:       args.address ?? '',
      custom_fields: { ...defaultCustom, ...(args.customFields ?? {}) },
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
  zipcode?:         string | null;
  isRemote?:        boolean | null;
  contractDetails?: ManatalContractDetails | null;
  salaryMin?:       number | null;
  salaryMax?:       number | null;
  currency?:        string | null;   // ISO-3 e.g. 'GBP'
  /** Manatal `frequency` — the period the salary is quoted for. */
  frequency?:       string | null;
  /** Manatal `is_salary_visible` — whether the range shows publicly. */
  isSalaryVisible?: boolean | null;
  /** Account-scoped Manatal industry id. Discovered, never guessed. */
  industryId?:      string | number | null;
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
  const body = { organization: orgIdNum, ...manatalJobBody(args), status: 'active', is_published: false };
  const data = await manatalFetch('/jobs/', undefined, {
    method:  'POST',
    baseUrl: WRITE_API_URL,
    body,
  });
  if (!data?.id) return null;
  return { id: String(data.id) };
}

/** The field half of a job body, shared by create and update so the two
 *  cannot drift. `organization` and the publish flags are NOT here:
 *  they belong to one operation each. */
function manatalJobBody(args: CreateJobArgs): Record<string, unknown> {
  // contract_details is an ENUM on Manatal v3 with no nullable flag —
  // sending null 400s. Build the body conditionally so optional non-
  // nullable fields are omitted when unset rather than nulled out.
  const body: Record<string, unknown> = {
    position_name:    args.title,
    description:      args.description ?? '',
    external_id:      args.externalId ?? null,
    address:          args.address ?? '',
    city:             args.city ?? '',
    state:            args.state ?? '',
    country:          args.country ?? '',
    is_remote:        args.isRemote ?? null,
    salary_min:       args.salaryMin != null ? String(args.salaryMin) : null,
    salary_max:       args.salaryMax != null ? String(args.salaryMax) : null,
    zipcode:          args.zipcode ?? '',
    currency:         args.currency ?? null,
    headcount:        args.headcount ?? null,
  };
  if (args.contractDetails) body.contract_details = args.contractDetails;
  // Same rule as contract_details: these are enum / FK / non-nullable
  // fields on Manatal v3, so an unset one is OMITTED rather than sent
  // as null. Sending null 400s the create, which would block
  // publishing entirely rather than just leaving a field blank.
  if (args.frequency) body.frequency = args.frequency;
  if (typeof args.isSalaryVisible === 'boolean') body.is_salary_visible = args.isSalaryVisible;
  if (args.industryId != null && String(args.industryId).trim() !== '') {
    body.industry = Number(args.industryId);
  }
  return body;
}

/**
 * PATCH an EXISTING job's fields.
 *
 * Re-publish used to send only `status` / `is_published` /
 * `is_pinned_in_career_page`, so correcting a role on our side and
 * pressing "Re-publish to Manatal" changed nothing about the advert —
 * the button reported success and the job board kept showing the old
 * salary, the old contract type and the unformatted description. The
 * only way to fix a published role was to edit it by hand in Manatal,
 * which is precisely what this integration exists to avoid.
 *
 * This deliberately OVERWRITES hand edits made in Manatal. Re-publish
 * is an explicit operator action meaning "make Manatal match what I
 * have here", and two sources of truth for one advert is the drift
 * this codebase keeps paying for elsewhere.
 */
export async function updateManatalJob(
  jobId: string,
  args: CreateJobArgs,
): Promise<boolean> {
  const data = await manatalFetch(`/jobs/${jobId}/`, undefined, {
    method:  'PATCH',
    baseUrl: WRITE_API_URL,
    body:    manatalJobBody(args),
  });
  return data !== null;
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

/* ─── Industries ──────────────────────────────────── */

export interface ManatalIndustry { id: string; name: string }

/**
 * The account's industry list, for the publish form's picker.
 *
 * DISCOVERED, never hardcoded. Industry ids are account-scoped — this
 * account's live jobs carry 7696959 (Building Materials), 7673671
 * (Manufacturing), 7673654 (Engineering - Others) and others — so a
 * baked-in list would be right for exactly one Manatal account and
 * silently wrong for any other.
 *
 * FAILS SOFT, on purpose. If the endpoint is absent or errors this
 * returns `[]`, the picker shows nothing to choose, `industry` is
 * omitted from the create, and publishing behaves exactly as it does
 * today. The alternative — guessing an id — risks a 400 that blocks
 * publishing outright, which is far worse than an unset field.
 */
export async function listManatalIndustries(): Promise<ManatalIndustry[]> {
  const data = await manatalFetch('/industries/', { page_size: '200' }, { baseUrl: WRITE_API_URL });
  const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return rows
    .filter((r: any) => r && r.id != null && r.name)
    .map((r: any) => ({ id: String(r.id), name: String(r.name) }));
}

/* ─── Config check ────────────────────────────────── */

export function isManatalConfigured(): boolean {
  return Boolean(API_KEY);
}
