import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Phase 7, Group 8 (adversarial QA on Group 5's own work).
// The original route generated the PDF, uploaded it and inserted a
// `reports` row BEFORE the conditional status-flip that actually
// guarded a double-submit — a genuine race would have produced
// duplicate files/rows before the loser's flip finally refused. The
// fix claims the draft FIRST; these pin that a lost claim never
// reaches the PDF/upload/reports-insert path at all, and that a
// mid-work failure reverts the claim rather than leaving the report
// stuck 'issued' with no file.

let claimCount: number | null;
let uploadShouldFail: boolean;
const calls: string[] = [];
let updateCalls: Record<string, unknown>[] = [];

vi.mock('@/lib/consultancy/portfolioAccess', () => ({
  requirePortfolioSession: () => Promise.resolve({
    session: { userId: 'consultant-1', email: 'c@laws.example.com', role: 'client_admin', companyId: 'co-laws' },
    organisations: [{ organisation_id: '11111111-1111-4111-8111-111111111111', name: 'ABC Manufacturing', organisation_type: 'direct_client', role_key: 'consultant', access_scope: 'full' }],
  }),
  portfolioIncludes: (orgs: { organisation_id: string }[], id: string) => orgs.some(o => o.organisation_id === id),
  createServiceSupabaseClient: () => fakeSb(),
}));

vi.mock('@/lib/email', () => ({ sendEmail: (e: { to: string }) => { calls.push(`email:${e.to}`); return Promise.resolve({ id: 'resend-1' }); } }));

function fakeSb() {
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'draft-1', summary: 'S', recommendations: null, next_visit_recommended_date: null, version: 1 } }) }) }) }),
            maybeSingle: () => {
              if (table === 'consultancy_visits') return Promise.resolve({ data: { id: '22222222-2222-4222-8222-222222222222', client_organisation_id: '11111111-1111-4111-8111-111111111111', visit_type: 'retained_visit', scheduled_date: '2026-10-01', status: 'awaiting_report' } });
              if (table === 'companies') return Promise.resolve({ data: { id: '11111111-1111-4111-8111-111111111111', name: 'ABC Manufacturing', contact_email: 'client@example.com' } });
              if (table === 'profiles') return Promise.resolve({ data: { full_name: 'A Consultant', email: 'c@laws.example.com' } });
              return Promise.resolve({ data: null });
            },
            order: () => Promise.resolve({ data: [] }),
            in: () => Promise.resolve({ data: [] }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateCalls.push({ table, payload });
          calls.push(`update:${table}:${JSON.stringify(payload)}`);
          return {
            eq: () => ({
              eq: () => Promise.resolve(table === 'consultancy_visit_reports' && 'status' in payload && payload.status === 'issued'
                ? { error: null, count: claimCount }
                : { error: null, count: 1 }),
              // storage_path update chains a single .eq() only
            }),
          };
        },
        insert: () => { calls.push(`insert:${table}`); return Promise.resolve({ error: null }); },
      };
    },
    storage: {
      from: () => ({
        upload: () => { calls.push('storage:upload'); return Promise.resolve(uploadShouldFail ? { error: { message: 'disk full' } } : { error: null }); },
      }),
    },
  };
}

const { POST } = await import('../route');
const call = () => POST(new NextRequest('https://portal.example.com/api/consultancy/clients/co-client/visits/visit-1/report/issue', { method: 'POST' }),
  { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111', visitId: '22222222-2222-4222-8222-222222222222' }) });

beforeEach(() => {
  claimCount = 1;
  uploadShouldFail = false;
  calls.length = 0;
  updateCalls = [];
});

describe('POST .../report/issue', () => {
  it('a lost claim (count 0) refuses with 409 and NEVER reaches the PDF/upload/reports-insert path', async () => {
    claimCount = 0;
    const res = await call();
    expect(res.status).toBe(409);
    expect(calls).not.toContain('storage:upload');
    expect(calls.some(c => c.startsWith('insert:reports'))).toBe(false);
  });

  it('a won claim proceeds through upload, reports insert, storage_path link, and email', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(calls).toContain('storage:upload');
    expect(calls.some(c => c.startsWith('insert:reports'))).toBe(true);
    expect(calls.some(c => c.startsWith('email:'))).toBe(true);
    // the claim itself happened before any PDF work
    const claimIdx = calls.findIndex(c => c.includes('"status":"issued"'));
    const uploadIdx = calls.indexOf('storage:upload');
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeLessThan(uploadIdx);
  });

  it('a failure mid-work (upload fails) reverts the claim back to draft', async () => {
    uploadShouldFail = true;
    const res = await call();
    expect(res.status).toBe(500);
    const revert = updateCalls.find(c => c.table === 'consultancy_visit_reports' && (c.payload as any).status === 'draft');
    expect(revert).toBeTruthy();
  });
});
