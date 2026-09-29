import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';

// The cron shape (same discipline as process-events/reminders): refused
// without the secret, and a snapshot row per company computed via the
// SAME pure scoring functions /health and /engagement use — never a
// second copy of the band/score formula that could drift from them.

let db: ReturnType<typeof fakeSupabase>;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => db.client,
}));

const { GET } = await import('../route');

const req = (secret?: string) => new NextRequest(`https://admin.example.com/api/cron/health-snapshot${secret ? `?secret=${secret}` : ''}`);

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.AUTOMATION_DISABLED;
  db = fakeSupabase({
    companies: [
      { id: 'co-healthy', active: true, last_portal_login: new Date().toISOString(), login_count_30d: 10 },
      { id: 'co-inactive', active: false, last_portal_login: null, login_count_30d: 0 },
    ],
    compliance_items: [],
    tickets: [],
    requisitions: [],
    profiles: [],
    documents: [],
    client_health_snapshots: [],
    automation_runs: [],
    actions: [],
    organisation_legal_obligations: [],
    hs_documents: [],
    hs_incidents: [],
    person_deployment_status: [],
    hs_equipment: [],
    audit_findings: [],
    contractors: [],
    contractor_insurances: [],
    environmental_permits: [],
    management_reviews: [],
    service_requests: [],
    consultancy_visits: [],
  });
});

describe('GET /api/cron/health-snapshot', () => {
  it('refuses without the secret and writes nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.tables.client_health_snapshots).toHaveLength(0);
  });

  it('writes one snapshot row per company, computed from the shared band/score functions', async () => {
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    const rows = db.tables.client_health_snapshots;
    expect(rows).toHaveLength(2);

    const healthy = rows.find((r: any) => r.company_id === 'co-healthy');
    expect(healthy?.band).toBe('green');
    expect(healthy?.engagement_score).toBeGreaterThan(50);

    const inactive = rows.find((r: any) => r.company_id === 'co-inactive');
    expect(inactive?.band).toBe('red'); // an inactive company is always red

    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'health-snapshot', outcome: 'ok' });
  });

  it('also writes the Phase 6 portfolio counts, sourced from real rows never a second copy of the band formula', async () => {
    db.tables.actions = [
      { id: 'a1', company_id: 'co-healthy', status: 'active', severity: 'critical' },
      { id: 'a2', company_id: 'co-healthy', status: 'complete', severity: 'critical' }, // closed — does not count
      { id: 'a3', company_id: 'co-healthy', status: 'active', severity: 'low' }, // not critical — does not count
    ];
    db.tables.hs_documents = [{ id: 'd1', company_id: 'co-healthy', status: 'review_due' }];
    db.tables.person_deployment_status = [
      { person_id: 'p1', company_id: 'co-healthy', status: 'READY', result: { summary: { safety_critical_gap: false } } },
      { person_id: 'p2', company_id: 'co-healthy', status: 'REVIEW_REQUIRED', result: { summary: { safety_critical_gap: true } } },
    ];
    db.tables.consultancy_visits = [
      { id: 'v1', client_organisation_id: 'co-healthy', status: 'scheduled', scheduled_date: '2099-01-15' },
      { id: 'v2', client_organisation_id: 'co-healthy', status: 'scheduled', scheduled_date: '2099-01-05' },
      { id: 'v3', client_organisation_id: 'co-healthy', status: 'cancelled', scheduled_date: '2099-01-01' },
    ];

    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    const healthy = db.tables.client_health_snapshots.find((r: any) => r.company_id === 'co-healthy');
    expect(healthy?.open_critical_actions).toBe(1);
    expect(healthy?.overdue_controlled_documents).toBe(1);
    expect(healthy?.workers_not_ready).toBe(1);
    expect(healthy?.safety_critical_gaps).toBe(1);
    expect(healthy?.next_consultant_visit_date).toBe('2099-01-05'); // earliest scheduled, cancelled one ignored

    const inactive = db.tables.client_health_snapshots.find((r: any) => r.company_id === 'co-inactive');
    expect(inactive?.open_critical_actions).toBe(0); // no cross-company leakage
    expect(inactive?.next_consultant_visit_date).toBeNull();
  });

  it('re-running the same day upserts (overwrites) rather than duplicating', async () => {
    await GET(req('s3cret'));
    await GET(req('s3cret'));
    const rows = db.tables.client_health_snapshots.filter((r: any) => r.company_id === 'co-healthy');
    expect(rows).toHaveLength(1);
  });

  it('AUTOMATION_DISABLED=1 records a disabled run and writes nothing', async () => {
    process.env.AUTOMATION_DISABLED = '1';
    const res = await GET(req('s3cret'));
    expect(res.status).toBe(200);
    expect(db.tables.client_health_snapshots).toHaveLength(0);
    expect(db.tables.automation_runs[0]).toMatchObject({ job: 'health-snapshot', outcome: 'disabled' });
  });
});
