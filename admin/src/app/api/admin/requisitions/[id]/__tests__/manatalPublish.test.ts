// What the publish route actually DOES to Manatal.
//
// This is the test that was missing, and its absence is why the
// re-publish defect shipped: the route sent only the publish flags, so
// correcting a role on our side changed nothing in Manatal while the
// button reported success. Every existing test here is over a pure
// function, and no pure-function test can see which calls a handler
// made — an empty answer and an unasked question are indistinguishable
// in a return value.
//
// So the assertions are the CALLS: which Manatal function, with which
// arguments, in which order.

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Recorder ─────────────────────────────────────────────── */

const calls: { fn: string; args: any[] }[] = [];
let createResult:  { id: string } | null = { id: '999' };
let updateResult   = true;
let publishResult  = true;
let configured     = true;

vi.mock('@/lib/manatal', () => ({
  isManatalConfigured: () => configured,
  lastManatalError:    () => ({ status: 400, message: 'stub Manatal error', path: '/jobs/' }),
  createManatalJob:  (...args: any[]) => { calls.push({ fn: 'create',  args }); return Promise.resolve(createResult); },
  updateManatalJob:  (...args: any[]) => { calls.push({ fn: 'update',  args }); return Promise.resolve(updateResult); },
  publishManatalJob: (...args: any[]) => { calls.push({ fn: 'publish', args }); return Promise.resolve(publishResult); },
}));

const logged: any[] = [];
// Returns a boolean, like the real one. A mock returning undefined
// made `logged` vanish from the JSON response (JSON.stringify drops
// undefined keys) and the assertion failed for a reason that had
// nothing to do with the route.
let logWriteOk = true;
let updateMatches = 1;
vi.mock('@/lib/manatalPublishLog', () => ({
  logPublishStep: (s: any) => { logged.push(s); return Promise.resolve(logWriteOk); },
}));

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

vi.mock('@/lib/rateLimit', () => ({
  limiters: { vendor: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse:   () => new Response('rate limited', { status: 429 }),
}));

/* ── Supabase stub ────────────────────────────────────────── */

let row: Record<string, any> | null = null;
let rowError: { message: string } | null = null;
const updates: Record<string, any>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: row, error: rowError }) }),
      }),
      update: (patch: Record<string, any>) => {
        updates.push(patch);
        // The real chain ends in `.select('id')`, because an UPDATE
        // matching no rows returns error:null and would otherwise
        // report success. `updateMatches` is how many rows come back.
        return {
          eq: () => ({
            select: () => Promise.resolve({
              data: Array.from({ length: updateMatches }, () => ({ id: REQ_ID })),
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

import { POST } from '../manatal-publish/route';

const REQ_ID = '7ae62d7d-491f-49e5-a250-b1816b6c9b03';

function baseRow(extra: Record<string, any> = {}) {
  return {
    id: REQ_ID,
    title: 'AI & Software Engineers',
    description: 'Build things.',
    location: 'London, UK',
    employment_type: 'Contract',
    working_model: 'remote',
    salary_min: 60, salary_max: 120, salary_range: null,
    salary_currency: 'USD', salary_period: 'hour', salary_visible: false,
    headcount: null, manatal_industry_id: null,
    must_haves: ['Python'], nice_to_haves: null,
    manatal_job_id: null,
    companies: { manatal_client_id: '8136723' },
    ...extra,
  };
}

function post() {
  const req = new Request('https://admin.test/api', { method: 'POST' }) as any;
  return POST(req, { params: { id: REQ_ID } });
}

beforeEach(() => {
  calls.length = 0;
  updates.length = 0;
  logged.length = 0;
  row = baseRow();
  rowError = null;
  createResult = { id: '999' };
  updateResult = true;
  publishResult = true;
  configured = true;
  logWriteOk = true;
  updateMatches = 1;
});

describe('a role that has never been published', () => {
  it('creates then publishes, and does not call update', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(calls.map(c => c.fn)).toEqual(['create', 'publish']);
  });

  it('stamps the job id and the published time', async () => {
    await post();
    expect(updates.some(u => u.manatal_job_id === '999')).toBe(true);
    expect(updates.some(u => u.manatal_published_at)).toBe(true);
  });
});

describe('re-publishing a role that already has a Manatal job', () => {
  beforeEach(() => { row = baseRow({ manatal_job_id: '4337074' }); });

  it('PATCHES THE FIELDS before flipping the publish flags', async () => {
    // The defect: this used to be ['publish'] alone, so a corrected
    // salary or description never reached Manatal while the button
    // still reported success.
    const res = await post();
    expect(res.status).toBe(200);
    expect(calls.map(c => c.fn)).toEqual(['update', 'publish']);
  });

  it('sends the real field values, not just the id', async () => {
    await post();
    const [jobId, args] = calls.find(c => c.fn === 'update')!.args;
    expect(jobId).toBe('4337074');
    // Spot-check the fields that were wrong on the live job. If update
    // were handed an empty object every one of these would be absent.
    expect(args).toMatchObject({
      currency:        'USD',
      frequency:       'hour',
      isSalaryVisible: false,
      city:            'London',
      country:         'United Kingdom',
      contractDetails: 'contractor',
      isRemote:        true,
      salaryMin:       60,
      salaryMax:       120,
    });
    expect(args.description).toContain('<p>Build things.</p>');
  });

  it('never creates a second job', async () => {
    await post();
    expect(calls.some(c => c.fn === 'create')).toBe(false);
  });

  it('does not publish, or stamp success, when the field update fails', async () => {
    // A 502 here must stop the run. Publishing anyway would flip the
    // job live carrying the values we just failed to correct.
    updateResult = false;
    const res = await post();
    expect(res.status).toBe(502);
    expect(calls.map(c => c.fn)).toEqual(['update']);
    expect(updates).toHaveLength(0);
  });
});

describe('failures are reported as failures', () => {
  it('does not stamp published_at when Manatal refuses the publish', async () => {
    publishResult = false;
    const res = await post();
    expect(res.status).toBe(502);
    expect(updates.some(u => u.manatal_published_at)).toBe(false);
  });

  it('refuses a client with no Manatal organization', async () => {
    row = baseRow({ companies: { manatal_client_id: null } });
    const res = await post();
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('distinguishes a FAILED READ from a missing role', async () => {
    // Both used to answer 404 "Requisition not found". A select that
    // names a column PostgREST does not know answers 400, and reporting
    // that as a missing role sends whoever is debugging it looking for
    // the wrong thing entirely — which is exactly what happens after a
    // migration adds columns the schema cache has not picked up yet.
    row = null;
    rowError = { message: 'column requisitions.salary_period does not exist' };
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('salary_period');
    expect(body.error).not.toMatch(/not found/i);
  });

  it('still says not found when the role genuinely is not there', async () => {
    row = null;
    rowError = null;
    const res = await post();
    expect(res.status).toBe(404);
  });
});

describe('every attempt leaves a durable record', () => {
  // The route reported its reason only to the browser, so two real
  // failures on the live role could not be diagnosed afterwards at all.
  it('logs the update step with what was sent', async () => {
    row = baseRow({ manatal_job_id: '4337074' });
    await post();
    const upd = logged.find(l => l.step === 'update');
    expect(upd).toBeTruthy();
    expect(upd.ok).toBe(true);
    expect(upd.sent.currency).toBe('USD');
    expect(upd.sent.frequency).toBe('hour');
  });

  it('logs a FAILED update with Manatal\'s own message', async () => {
    row = baseRow({ manatal_job_id: '4337074' });
    updateResult = false;
    await post();
    const upd = logged.find(l => l.step === 'update');
    expect(upd.ok).toBe(false);
    expect(upd.message).toBe('stub Manatal error');
    expect(upd.http_status ?? upd.httpStatus).toBe(400);
  });

  it('logs the precondition failure when the client has no Manatal org', async () => {
    row = baseRow({ companies: { manatal_client_id: null } });
    await post();
    expect(logged.map(l => l.step)).toEqual(['precondition']);
    expect(logged[0].ok).toBe(false);
  });

  it('logs create and publish on a first publish', async () => {
    await post();
    expect(logged.map(l => l.step)).toEqual(['create', 'publish']);
    expect(logged.every(l => l.ok)).toBe(true);
  });
});

describe('the exits that used to be silent', () => {
  // The first real failure landed in exactly this gap: the route
  // returned before any logging, so an empty log read as "the button
  // was never pressed" when it meant "we stopped in the first ten
  // lines".
  it('logs a missing MANATAL_API_KEY instead of exiting quietly', async () => {
    configured = false;
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(logged.map(l => l.step)).toEqual(['precondition']);
    expect(logged[0].message).toContain('MANATAL_API_KEY');
    expect(calls).toHaveLength(0);
    expect(body.error).toContain('MANATAL_API_KEY');
  });

  it('logs a failed read, naming the column PostgREST rejected', async () => {
    row = null;
    rowError = { message: 'column requisitions.salary_period does not exist' };
    await post();
    expect(logged.map(l => l.step)).toEqual(['precondition']);
    expect(logged[0].message).toContain('salary_period');
  });

  it('logs a genuinely missing role too', async () => {
    row = null; rowError = null;
    await post();
    expect(logged[0].message).toContain('not found');
  });

  it('stamps the route version on every answer', async () => {
    // Answers "is the deployed route the one I am reading?" from data.
    // Two rounds were spent unable to tell a stale deploy from a bug.
    const okBody = await (await post()).json();
    expect(okBody.route_version).toMatch(/^manatal-publish\//);
    configured = false;
    const failBody = await (await post()).json();
    expect(failBody.route_version).toMatch(/^manatal-publish\//);
  });

  it('reports whether the diagnostic row was actually written', async () => {
    // A log write that fails must not leave an empty table to be read
    // as "nothing happened".
    configured = false;
    expect((await (await post()).json()).logged).toBe(true);
    logWriteOk = false;
    expect((await (await post()).json()).logged).toBe(false);
  });
});

describe('an UPDATE that silently matches no rows', () => {
  // supabase answers error:null for an UPDATE that changed nothing —
  // RLS refusing it looks identical to success. Without asking for the
  // row back, the route would report a published role while
  // manatal_published_at stayed exactly where it was, which is the
  // symptom that started all of this.
  // Each branch has its OWN guard and each must be driven separately.
  // The first cut of these tests used a row with no manatal_job_id for
  // both, so the CREATE guard returned first and disabling the PUBLISH
  // guard changed nothing — the mutation passed and the test proved
  // nothing about the branch it named.
  it('fails the CREATE path rather than reporting a stored job id', async () => {
    row = baseRow();               // no job id -> create branch
    updateMatches = 0;
    const body = await (await post()).json();
    expect(body.error).toMatch(/Created Manatal job .* matched no rows/i);
  });

  it('fails the PUBLISH path rather than reporting a published role', async () => {
    row = baseRow({ manatal_job_id: '4337074' });   // skips create
    updateMatches = 0;
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Published in Manatal but could not record it locally/i);
  });

  it('records both in the log rather than passing silently', async () => {
    row = baseRow({ manatal_job_id: '4337074' });
    updateMatches = 0;
    await post();
    expect(logged.some(l => /matched no rows/i.test(l.message ?? ''))).toBe(true);
  });
});
