import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';
import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';
import type { PortfolioCounts } from '@/lib/health/portfolioCounts';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

const GREEN_TWIN: ComplianceTwinSnapshot = {
  overallBand: 'green',
  areas: [
    { area: 'safety', label: 'Safety (H&S)', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'governance', label: 'Governance & Environmental', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'risk_graph', label: 'Risk Graph', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'incident_patterns', label: 'Incident Patterns', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'evidence', label: 'Evidence Coverage', band: 'green', reasons: ['clean'], inputs: {} },
  ],
};

const CLEAN_PORTFOLIO: PortfolioCounts = {
  open_critical_actions: 0, overdue_legal_evaluations: 0, overdue_controlled_documents: 0,
  open_incident_investigations: 0, safety_critical_gaps: 0, workers_not_ready: 0,
  assets_unavailable: 0, major_audit_findings: 0, contractor_expiring: 0,
  environmental_permits_expiring: 0, management_reviews_due: 0, outstanding_service_requests: 0,
  next_consultant_visit_date: null,
};

vi.mock('@/lib/complianceTwin/loadSnapshot', () => ({
  loadComplianceTwinSnapshot: async () => ({ snapshot: structuredClone(GREEN_TWIN), loadError: null }),
}));
vi.mock('@/lib/boardAssurance/loadPortfolioCounts', () => ({
  loadPortfolioCountsForCompany: async () => ({ counts: structuredClone(CLEAN_PORTFOLIO), loadError: null }),
}));

let db: FakeDb;
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => db.client,
}));

const { POST } = await import('../route');

const req = (body: unknown) => new NextRequest('https://admin.example.com/api/admin/board-assurance/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const COMPANY = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  db = fakeSupabase({ management_reviews: [], management_review_decisions: [], board_assurance_reports: [] });
});

describe('POST /api/admin/board-assurance/generate', () => {
  it('picks the latest COMPLETED review AT OR BEFORE the reporting quarter\'s end, never one that postdates it', async () => {
    db.tables.management_reviews.push(
      { id: 'review-in-quarter', company_id: COMPANY, status: 'completed', review_date: '2026-02-15' },
      // Dated AFTER Q1 2026 ends (2026-03-31) — must never be picked when generating Q1.
      { id: 'review-after-quarter', company_id: COMPANY, status: 'completed', review_date: '2026-06-10' },
    );
    db.tables.management_review_decisions.push(
      { id: 'd1', review_id: 'review-in-quarter', topic: 'Fire safety', decision_text: 'Reissue the fire risk assessment' },
      { id: 'd2', review_id: 'review-after-quarter', topic: 'Later topic', decision_text: 'Should never appear on the Q1 report' },
    );

    const res = await POST(req({ companyId: COMPANY, year: 2026, quarter: 1 }));
    expect(res.status).toBe(200);

    const inserted = db.tables.board_assurance_reports[0];
    expect(inserted.report_data.latestManagementReview.reviewDate).toBe('2026-02-15');
    expect(inserted.report_data.latestManagementReview.decisions).toEqual([
      { topic: 'Fire safety', decisionText: 'Reissue the fire risk assessment' },
    ]);
  });

  it('is null when the only completed review postdates the reporting quarter', async () => {
    db.tables.management_reviews.push(
      { id: 'review-after-quarter', company_id: COMPANY, status: 'completed', review_date: '2026-06-10' },
    );

    const res = await POST(req({ companyId: COMPANY, year: 2026, quarter: 1 }));
    expect(res.status).toBe(200);
    expect(db.tables.board_assurance_reports[0].report_data.latestManagementReview).toBeNull();
  });
});
