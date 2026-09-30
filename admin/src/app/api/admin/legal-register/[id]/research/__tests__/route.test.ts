import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

vi.mock('@/lib/rateLimit', () => ({
  limiters: { vendor: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'staff-1',
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

let requirement: { id: string; title: string; jurisdiction: string } | null;
let insertedNotes: Array<{ legal_requirement_id: string; source: string; query_used: string; raw_result_summary: string }>;
let tavilyCalls: string[];
let tavilyOutcome: { results: unknown; error: string | null };

vi.mock('@/lib/tavily/client', () => ({
  tavilySearch: (query: string) => { tavilyCalls.push(query); return Promise.resolve(tavilyOutcome); },
  summariseResults: () => 'Verbatim Tavily summary.',
  defaultQueryFor: (title: string, jurisdiction: string) => `${title} ${jurisdiction} default query`,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from(table: string) {
      if (table === 'legal_requirements') {
        return { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: requirement && requirement.id === id ? requirement : null }) }) }) };
      }
      if (table === 'legal_requirement_research_notes') {
        return {
          insert: (row: typeof insertedNotes[number]) => {
            insertedNotes.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'note-1', ...row, reviewed_by: null, reviewed_at: null, action_taken: null, created_by: 'staff-1', created_at: '2026-09-30T00:00:00Z' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`fake: unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('../route');

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/admin/legal-register/req-1/research', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  requirement = { id: 'req-1', title: 'Health and Safety at Work etc. Act 1974', jurisdiction: 'UK' };
  insertedNotes = [];
  tavilyCalls = [];
  tavilyOutcome = { results: [{ title: 'x', url: 'https://x', content: 'y' }], error: null };
});

describe('POST /api/admin/legal-register/[id]/research', () => {
  it('uses the requirement\'s own default query when none is supplied', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ id: 'req-1' }) });
    expect(res.status).toBe(200);
    expect(tavilyCalls).toEqual(['Health and Safety at Work etc. Act 1974 UK default query']);
    expect(insertedNotes[0].source).toBe('tavily');
    expect(insertedNotes[0].raw_result_summary).toBe('Verbatim Tavily summary.');
  });

  it('uses a staff-supplied query override instead of the default', async () => {
    const res = await POST(req({ query: 'recent HSE enforcement notices 2026' }), { params: Promise.resolve({ id: 'req-1' }) });
    expect(res.status).toBe(200);
    expect(tavilyCalls).toEqual(['recent HSE enforcement notices 2026']);
  });

  it('404s for a legal requirement that does not exist', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ id: 'no-such-requirement' }) });
    expect(res.status).toBe(404);
    expect(tavilyCalls).toHaveLength(0);
  });

  it('reports a Tavily failure as an error and inserts no note', async () => {
    tavilyOutcome = { results: null, error: 'TAVILY_API_KEY is not configured' };
    const res = await POST(req({}), { params: Promise.resolve({ id: 'req-1' }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/TAVILY_API_KEY/);
    expect(insertedNotes).toHaveLength(0);
  });

  it('never writes anything to organisation_legal_obligations or compliance_evaluations', async () => {
    // The fake's `from()` throws on any table it doesn't explicitly
    // whitelist above — so a genuine attempt to touch either table
    // would fail this test outright, not merely go unasserted.
    const res = await POST(req({}), { params: Promise.resolve({ id: 'req-1' }) });
    expect(res.status).toBe(200);
  });

  it('rejects a query longer than the column\'s own 500-char limit', async () => {
    const res = await POST(req({ query: 'x'.repeat(501) }), { params: Promise.resolve({ id: 'req-1' }) });
    expect(res.status).toBe(400);
    expect(tavilyCalls).toHaveLength(0);
  });
});
