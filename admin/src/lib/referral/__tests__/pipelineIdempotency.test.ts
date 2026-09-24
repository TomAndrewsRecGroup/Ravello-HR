// The referral pipeline must never email the same applicant twice.
//
// 2026-09-22 → 09-24: "AI & Software Engineers" passed 1,000
// referral_applications rows. The already-processed read was one
// `.in()` over every applicant, PostgREST answered with its first
// 1,000 rows, and the 26 rows past the cap looked new again. Each run
// re-scanned them, emailed them, THEN tried the insert, which failed
// on the unique constraint, so nothing recorded the send. Same people,
// every hour, up to 29 times.
//
// The fake client below reproduces the actual server behaviour — the
// 1,000-row cap and the unique constraint — rather than a generic
// "the read fails" stand-in, so these tests fail on the real bug.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn();
vi.mock('../../email/client', () => ({
  sendEmail:      (...a: unknown[]) => sendEmail(...a),
  lastEmailError: () => null,
}));

vi.mock('../../manatal', () => ({
  getManatalCandidate: vi.fn(async (id: string) => ({
    id, full_name: `Person ${id}`, email: `${id}@example.com`,
    candidate_location: 'London, United Kingdom', consent: true,
  })),
  getManatalMatchesForJob: vi.fn(),
  isJobBoardApplicant: () => true,
  manatalRefId: (c: unknown) => (c == null ? '' : String((c as { id?: unknown }).id ?? c)),
}));

vi.mock('../cvText', () => ({
  buildScanText: vi.fn(async () => ({ source: 'cv_pdf', text: 'cv' })),
}));

vi.mock('../ivylensScan', () => ({
  runCandidateScan: vi.fn(async () => ({
    scan: { scan_id: 's', overall_score: 95, skill_matches: [], strengths: [], gaps: [] },
    error: null,
  })),
}));

vi.mock('../gate', () => ({
  evaluate: vi.fn(({ scan }: { scan: unknown }) => ({
    status: scan ? 'qualified' : 'scan_error',
    score: 95, countryResult: 'clear', countryDetected: 'United Kingdom',
    failedCriteria: [], reasons: [],
  })),
}));

import { getManatalMatchesForJob } from '../../manatal';
import {
  DEFAULT_BATCH_CAP, emptyTally, processMatch, processRole, readProcessedIds,
  type RoleRow,
} from '../pipeline';

const REQ = 'req-1';
const MAX_ROWS = 1000; // Supabase's PostgREST default

type Row = Record<string, unknown>;

/** Just enough of supabase-js for the pipeline, with the two server
 *  behaviours that matter: the row cap and the unique constraint. */
function fakeSupabase(apps: Row[]) {
  const candidates: Row[] = [];
  let nextId = 1;
  let selectCalls = 0;

  function from(table: string) {
    if (table === 'referral_applications') {
      return {
        select: () => {
          selectCalls++;
          const filters: Array<(r: Row) => boolean> = [];
          const q = {
            eq(col: string, v: unknown) { filters.push(r => r[col] === v); return q; },
            in(col: string, vs: unknown[]) { filters.push(r => vs.includes(r[col])); return q; },
            then(res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) {
              const data = apps.filter(r => filters.every(f => f(r))).slice(0, MAX_ROWS);
              return Promise.resolve({ data, error: null }).then(res, rej);
            },
          };
          return q;
        },
        insert: (row: Row) => {
          const dup = apps.some(r =>
            r.requisition_id === row.requisition_id &&
            r.manatal_candidate_id === row.manatal_candidate_id);
          if (dup) {
            return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } });
          }
          apps.push({ ...row });
          return Promise.resolve({ error: null });
        },
        update: (patch: Row) => {
          const filters: Array<(r: Row) => boolean> = [];
          const q = {
            eq(col: string, v: unknown) { filters.push(r => r[col] === v); return q; },
            then(res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) {
              let count = 0;
              for (const r of apps) if (filters.every(f => f(r))) { Object.assign(r, patch); count++; }
              return Promise.resolve({ error: null, count }).then(res, rej);
            },
          };
          return q;
        },
      };
    }
    if (table === 'candidates') {
      return {
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              const r = { ...row, id: `cand-${nextId++}` };
              candidates.push(r);
              return { data: { id: r.id }, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: async (_c: string, id: unknown) => {
            const i = candidates.findIndex(c => c.id === id);
            if (i >= 0) candidates.splice(i, 1);
            return { error: null };
          },
        }),
      };
    }
    if (table === 'email_log') return { insert: async () => ({ error: null }) };
    throw new Error(`unexpected table ${table}`);
  }

  return {
    client: { from } as never,
    apps,
    candidates,
    get selectCalls() { return selectCalls; },
  };
}

function role(): RoleRow {
  return {
    requisition_id: REQ, enabled: true, dry_run: false,
    partner_name: 'Micro1', referral_url: 'https://example.com/apply',
    auto_send_threshold: 85, review_threshold: 75,
    blocked_countries: [], mandatory_criteria: [],
    requisition: {
      id: REQ, title: 'AI & Software Engineers', company_id: 'co-1',
      manatal_job_id: 'job-1', ivylens_role_id: 'r', jd_text: 'jd', description: null,
    },
  } as unknown as RoleRow;
}

const budget = () => ({ left: DEFAULT_BATCH_CAP, deadline: Date.now() + 60_000 });

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ id: 'resend-1' });
});

describe('readProcessedIds', () => {
  it('sees every existing row even when there are more than the 1,000-row cap', async () => {
    const ids = Array.from({ length: 1868 }, (_, i) => `m${i}`);
    const apps = ids.slice(0, 1026).map(id => ({ requisition_id: REQ, manatal_candidate_id: id }));
    const fake = fakeSupabase(apps);

    const seen = await readProcessedIds(fake.client, REQ, ids);
    expect(seen?.size).toBe(1026);
  });
});

describe('processRole on a role past 1,000 rows (the 2026-09-22 incident)', () => {
  it('does not re-email anyone who already holds a row', async () => {
    // The live shape: 1,026 processed, oldest first, plus a few new.
    const processed = Array.from({ length: 1026 }, (_, i) => `m${String(i).padStart(4, '0')}`);
    const fresh     = ['n1', 'n2', 'n3'];
    const apps = processed.map(id => ({ requisition_id: REQ, manatal_candidate_id: id, status: 'email_sent' }));
    const fake = fakeSupabase(apps);

    vi.mocked(getManatalMatchesForJob).mockResolvedValue({
      matches: [...processed, ...fresh].map((id, i) => ({
        id: `match-${id}`, candidate: { id }, created_at: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}`,
      })),
      truncated: false,
    } as never);

    const tally = emptyTally();
    await processRole(fake.client, role(), tally, budget());

    const to = sendEmail.mock.calls.map(c => (c[0] as { to: string }).to);
    expect(to.sort()).toEqual(['n1@example.com', 'n2@example.com', 'n3@example.com']);
    expect(tally.already_processed).toBe(1026);
    expect(tally.emailed).toBe(3);
    expect(fake.apps.filter(r => r.status === 'email_sent')).toHaveLength(1029);
  });

  it('runs twice in a row and emails nobody the second time', async () => {
    const fake = fakeSupabase([]);
    vi.mocked(getManatalMatchesForJob).mockResolvedValue({
      matches: ['a', 'b'].map(id => ({ id: `match-${id}`, candidate: { id }, created_at: '2026-09-01' })),
      truncated: false,
    } as never);

    await processRole(fake.client, role(), emptyTally(), budget());
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const second = emptyTally();
    await processRole(fake.client, role(), second, budget());
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(second.already_processed).toBe(2);
  });
});

describe('processMatch claims the row before emailing', () => {
  it('sends nothing when the row cannot be written', async () => {
    // Whatever made the guard miss this person, the unique constraint
    // still refuses the insert — and that must stop the email.
    const fake = fakeSupabase([{ requisition_id: REQ, manatal_candidate_id: 'x1', status: 'email_sent' }]);
    const tally = emptyTally();

    await processMatch(fake.client, role(), { id: 'match-x1', candidate: { id: 'x1' } } as never, tally, budget());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(tally.emailed).toBe(0);
    expect(tally.already_processed).toBe(1);
    expect(fake.candidates).toHaveLength(0); // orphan removed
  });

  it('marks the row email_sent with the provider id after a successful send', async () => {
    const fake = fakeSupabase([]);
    const tally = emptyTally();
    await processMatch(fake.client, role(), { id: 'match-y1', candidate: { id: 'y1' } } as never, tally, budget());

    const row = fake.apps.find(r => r.manatal_candidate_id === 'y1')!;
    expect(row.status).toBe('email_sent');
    expect(row.email_provider_id).toBe('resend-1');
    expect(row.email_sent_at).toBeTruthy();
    expect((row.status_history as unknown[]).length).toBe(2);
    expect(tally.notes).toEqual([]);
  });

  it('leaves the row qualified, not email_sent, when the send fails', async () => {
    sendEmail.mockResolvedValue(null);
    const fake = fakeSupabase([]);
    const tally = emptyTally();
    await processMatch(fake.client, role(), { id: 'match-z1', candidate: { id: 'z1' } } as never, tally, budget());

    const row = fake.apps.find(r => r.manatal_candidate_id === 'z1')!;
    expect(row.status).toBe('qualified');
    expect(row.email_sent_at).toBeNull();
    expect(tally.email_failures).toBe(1);
  });
});
