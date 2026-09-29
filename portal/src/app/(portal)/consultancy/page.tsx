import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Building2, CalendarDays, ClipboardList, ListChecks, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioOrgIds, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';

export const metadata: Metadata = { title: 'Command Centre' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

interface Snapshot {
  company_id: string;
  band: string;
  open_critical_actions: number;
  overdue_legal_evaluations: number;
  overdue_controlled_documents: number;
  workers_not_ready: number;
  assets_unavailable: number;
  major_audit_findings: number;
  next_consultant_visit_date: string | null;
}

// Core-OS 360 Phase 6, section 1: the Consultancy Portfolio Model.
// portfolio_organisations() (167) is the one function that can answer
// "which clients may I currently act in" — never inferred from
// organisation_relationships alone, and never widened to every company.
export default async function ConsultancyPortfolioPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const orgIds = portfolioOrgIds(portfolio.organisations);
  let snapshots: Snapshot[] = [];
  if (orgIds.length > 0) {
    const sb = createServiceSupabaseClient();
    const { data } = await sb.from('client_health_snapshots')
      .select('company_id, band, open_critical_actions, overdue_legal_evaluations, overdue_controlled_documents, workers_not_ready, assets_unavailable, major_audit_findings, next_consultant_visit_date, snapshot_date')
      .in('company_id', orgIds).order('snapshot_date', { ascending: false }).limit(orgIds.length * 2);
    // Latest row per company — the query isn't DISTINCT ON (PostgREST
    // has none), so pick the first (most recent) occurrence per id.
    const seen = new Set<string>();
    for (const row of (data ?? []) as (Snapshot & { snapshot_date: string })[]) {
      if (seen.has(row.company_id)) continue;
      seen.add(row.company_id);
      snapshots.push(row);
    }
  }
  const byOrg = new Map(snapshots.map(s => [s.company_id, s]));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Command Centre</h1>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
            {portfolio.organisations.length} authorised client{portfolio.organisations.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/consultancy/attention-queue" className="btn-secondary btn-sm"><ListChecks size={16} /> Attention Queue</Link>
          <Link href="/consultancy/calendar" className="btn-secondary btn-sm"><CalendarDays size={16} /> Calendar</Link>
          <Link href="/consultancy/workload" className="btn-secondary btn-sm"><Users size={16} /> Workload</Link>
          <Link href="/consultancy/templates" className="btn-secondary btn-sm"><ClipboardList size={16} /> Visit Templates</Link>
          <Link href="/consultancy/metrics" className="btn-secondary btn-sm"><BarChart3 size={16} /> Metrics</Link>
        </div>
      </div>

      {portfolio.organisations.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Building2 size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No authorised clients yet.</p></div></div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {portfolio.organisations.map(org => {
            const s = byOrg.get(org.organisation_id);
            const bandColor = s?.band === 'red' ? 'var(--red)' : s?.band === 'amber' ? 'var(--gold)' : 'var(--teal)';
            return (
              <Link key={org.organisation_id} href={`/consultancy/clients/${org.organisation_id}`} className="card p-4 space-y-2 block hover:opacity-90">
                <div className="flex items-center justify-between">
                  <strong>{org.name}</strong>
                  {s && <span className="badge" style={{ background: bandColor, color: '#fff' }}>{s.band}</span>}
                </div>
                {s ? (
                  <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
                    <li>Open critical actions: <strong>{s.open_critical_actions}</strong></li>
                    <li>Overdue legal reviews: <strong>{s.overdue_legal_evaluations}</strong></li>
                    <li>Controlled documents overdue: <strong>{s.overdue_controlled_documents}</strong></li>
                    <li>Workers not ready: <strong>{s.workers_not_ready}</strong></li>
                    <li>Assets unavailable: <strong>{s.assets_unavailable}</strong></li>
                    <li>Major audit findings: <strong>{s.major_audit_findings}</strong></li>
                    <li>Next consultant visit: <strong>{fmt(s.next_consultant_visit_date)}</strong></li>
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No snapshot yet — the daily health-snapshot cron has not run for this client.</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
