import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioOrgIds, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { loadAttentionQueue } from '@/lib/consultancy/loadAttentionQueue';
import { readAllPages } from '@/lib/supabase/paged';

export const metadata: Metadata = { title: 'Consultant Workload' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 6, section 6: per-consultant workload. Reuses the
// Attention Queue's own data (never a second task database) plus the
// two categories the queue doesn't already carry — visits due and
// documents awaiting consultant review.
export default async function ConsultantWorkloadPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const orgIds = portfolioOrgIds(portfolio.organisations);
  const sb = createServiceSupabaseClient();
  const orgNames = new Map(portfolio.organisations.map(o => [o.organisation_id, o.name]));

  const [items, visitsPage, docsAwaitingReviewPage] = await Promise.all([
    loadAttentionQueue(portfolio),
    orgIds.length
      ? readAllPages<any>((from, to) => sb.from('consultancy_visits').select('id, client_organisation_id, scheduled_date, visit_type, status')
          .eq('status', 'scheduled').in('client_organisation_id', orgIds).order('scheduled_date', { ascending: true }).range(from, to))
      : Promise.resolve({ rows: [], truncated: false }),
    orgIds.length
      ? readAllPages<any>((from, to) => sb.from('hs_documents').select('id, company_id, title, status')
          .eq('status', 'pending_review').in('company_id', orgIds).order('id').range(from, to))
      : Promise.resolve({ rows: [], truncated: false }),
  ]);

  const overdueActions = items.filter(i => i.sourceType === 'actions');
  const auditsLegalDue = items.filter(i => i.sourceType === 'organisation_legal_obligations' || i.sourceType === 'management_reviews');
  const serviceRequestsAwaiting = items.filter(i => i.sourceType === 'service_requests');
  const visitsDue = visitsPage.rows;
  const docsAwaitingReview = docsAwaitingReviewPage.rows;

  const CardCount = ({ label, n }: { label: string; n: number }) => (
    <div className="card p-4">
      <p className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{n}</p>
      <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{label}</p>
    </div>
  );

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Consultant Workload</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{portfolio.organisations.length} assigned client{portfolio.organisations.length === 1 ? '' : 's'}</p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <CardCount label="Assigned clients" n={portfolio.organisations.length} />
        <CardCount label="Visits due" n={visitsDue.length} />
        <CardCount label="Overdue client actions" n={overdueActions.length} />
        <CardCount label="Audits/legal reviews due" n={auditsLegalDue.length} />
        <CardCount label="Service requests awaiting response" n={serviceRequestsAwaiting.length} />
        <CardCount label="Documents awaiting review" n={docsAwaitingReview.length} />
      </div>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Visits due</h2>
        {visitsDue.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None scheduled.</p> : (
          <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
            {visitsDue.map((v: any) => (
              <li key={v.id}>
                {fmt(v.scheduled_date)} — {orgNames.get(v.client_organisation_id) ?? 'Unknown client'} ({v.visit_type})
                {' '}<Link href={`/open-workspace?org=${v.client_organisation_id}&next=/dashboard`} className="underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Overdue client actions</h2>
        {overdueActions.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None.</p> : (
          <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
            {overdueActions.map(i => (
              <li key={i.key}>
                {i.clientName} — {i.state}
                {' '}<Link href={`/open-workspace?org=${i.clientOrganisationId}&next=${encodeURIComponent(i.link)}`} className="underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
