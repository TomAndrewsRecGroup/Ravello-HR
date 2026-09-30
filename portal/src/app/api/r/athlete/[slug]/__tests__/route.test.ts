import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — the ONE genuinely
// untested entry point the completion matrix names for Athletes To
// Industry: this live, public, unauthenticated route
// (docs/CORE_OS_360_COMPLETION_MATRIX.md's Protected Legacy manifest,
// docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §1). admin's
// athleteWelcome.test.ts already covers the admin-side template in
// isolation (UNIT-ONLY, unaffected by this file).
//
// buildAthleteWelcomeEmail is left UNMOCKED so the real A2I gold shell
// and copy are exercised end to end, matching the manual script's own
// step 3 requirement; only sendEmail (a real Resend fetch) is mocked.

let companies: Array<{ id: string; slug: string; feature_flags: Record<string, unknown> | null }>;
let athletes: Array<Record<string, unknown>>;
const sent: Array<{ to: string; subject: string; html: string; tag?: string }> = [];
const uploaded: Array<{ path: string }> = [];

function fakeSupabase() {
  return {
    from(table: 'companies' | 'athletes') {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                async maybeSingle() {
                  const rows = (table === 'companies' ? companies : athletes) as Record<string, unknown>[];
                  const row = rows.find(r => r[col] === val) ?? null;
                  return { data: row, error: null };
                },
                ilike(col2: string, val2: string) {
                  return {
                    async limit(n: number) {
                      const rows = (athletes as Record<string, unknown>[]).filter(
                        r => r[col] === val && String(r[col2] ?? '').toLowerCase() === val2.toLowerCase(),
                      );
                      return { data: rows.slice(0, n), error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          return {
            select(_cols: string) {
              return {
                async single() {
                  const row = { id: `athlete-${athletes.length + 1}`, ...payload };
                  athletes.push(row);
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              const row = (athletes as Record<string, unknown>[]).find(r => r[col] === val);
              if (row) Object.assign(row, patch);
              return { data: null, error: null };
            },
          };
        },
      };
    },
    storage: {
      from: () => ({
        async upload(path: string) {
          uploaded.push({ path });
          return { error: null };
        },
      }),
    },
  };
}

vi.mock('@/lib/referral', () => ({
  getServiceClient: () => fakeSupabase(),
  findReferralCompany: async (supabase: ReturnType<typeof fakeSupabase>, slug: string) => {
    const { data } = await supabase.from('companies').select('*').eq('slug', slug.trim().toLowerCase()).maybeSingle();
    if (!data || (data as { feature_flags: Record<string, unknown> | null }).feature_flags?.athletes_to_industry === false) return null;
    return data;
  },
}));

vi.mock('@/lib/email', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn(async (input: { to: string; subject: string; html: string; tag?: string }) => {
      sent.push(input);
      return { id: 'email-1', delivered: true as const };
    }),
    lastEmailError: () => null,
  };
});

const { POST } = await import('../route');

function formRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new NextRequest('https://portal.example.com/r/athlete/test-co', { method: 'POST', body: fd });
}

const call = (fields: Record<string, string>, slug = 'test-co') =>
  POST(formRequest(fields), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  companies = [{ id: 'co-1', slug: 'test-co', feature_flags: null }];
  athletes = [];
  sent.length = 0;
  uploaded.length = 0;
});

describe('POST /api/r/athlete/[slug]', () => {
  it('creates an athlete on the referring company\'s roster, flagged source = referral', async () => {
    const res = await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    expect(res.status).toBe(200);
    expect(athletes).toHaveLength(1);
    expect(athletes[0]).toMatchObject({ company_id: 'co-1', full_name: 'Jordan Smith', source: 'referral', created_by: null });
  });

  it('sends the welcome email in the A2I gold shell, never the purple TPS one, with Andrews Recruitment Group named', async () => {
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/Athletes To Industry/);
    expect(sent[0].html).toMatch(/Andrews Recruitment Group's Athletes To Industry programme/);
    // wrapEmailGold's own footer line and palette constant — the
    // A2I-specific dark navy/gold shell, never the purple TPS one.
    expect(sent[0].html).toMatch(/Operated by Andrews Recruitment Group/);
    expect(sent[0].html).toMatch(/#c9a24a/); // A2I_GOLD
    expect(sent[0].html).not.toMatch(/The People System's Athletes To Industry/);
  });

  it('stamps welcome_email_sent_at on the athlete row once the send succeeds', async () => {
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    expect(athletes[0].welcome_email_sent_at).toBeTruthy();
  });

  it('a second submission with the same company + email creates no duplicate row and sends no duplicate email', async () => {
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    const res2 = await call({ full_name: 'Jordan Smith (resubmit)', email: 'Jordan@Example.com' });
    expect(res2.status).toBe(200);
    expect(athletes).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('a genuinely different athlete on the same company still gets created and emailed', async () => {
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    await call({ full_name: 'Alex Jones', email: 'alex@example.com' });
    expect(athletes).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('the same email at a DIFFERENT company is not deduped against the first', async () => {
    companies.push({ id: 'co-2', slug: 'other-co', feature_flags: null });
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' }, 'test-co');
    await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' }, 'other-co');
    expect(athletes).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('404s for an unknown slug, never leaking whether ANY row was created', async () => {
    const res = await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' }, 'does-not-exist');
    expect(res.status).toBe(404);
    expect(athletes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('404s when the company has Athletes To Industry explicitly switched off', async () => {
    companies[0].feature_flags = { athletes_to_industry: false };
    const res = await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    expect(res.status).toBe(404);
    expect(athletes).toHaveLength(0);
  });

  it('refuses with no name, no valid email, and never creates a row or sends an email on that refusal', async () => {
    const noName = await call({ full_name: '', email: 'jordan@example.com' });
    expect(noName.status).toBe(400);
    const badEmail = await call({ full_name: 'Jordan Smith', email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect(athletes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('the honeypot field silently reports success and creates nothing', async () => {
    const res = await call({ full_name: 'A Bot', email: 'bot@example.com', company: 'I am a bot' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(athletes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('never leaks the created row to the anonymous caller — the response is always just { ok: true }', async () => {
    const res = await call({ full_name: 'Jordan Smith', email: 'jordan@example.com' });
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
