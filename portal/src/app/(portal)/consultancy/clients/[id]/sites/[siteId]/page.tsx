import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { loadAttentionQueue } from '@/lib/consultancy/loadAttentionQueue';
import type { QueueSeverity } from '@/lib/consultancy/attentionQueue';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string; siteId: string }> }): Promise<Metadata> {
  const { siteId } = await params;
  return { title: `Site — ${siteId.slice(0, 8)}` };
}

const SEVERITY_COLOR: Record<QueueSeverity, string> = {
  critical: 'var(--red)', high: 'var(--gold)', medium: 'var(--blue)', low: 'var(--ink-faint)',
};

// Core-OS 360 Completion Programme, Phase 24, Group 3 (closes
// gap-ledger row C6.13 — "site-level drilldown so a portfolio issue
// resolves to the responsible client/site/record"). The Attention
// Queue's own siteId/siteName (Phase 22, Group 6) already labels each
// item; nothing anywhere let a consultant actually CLICK a site and
// see everything open there. This page never re-derives the queue —
// it calls the SAME loadAttentionQueue() the /consultancy/
// attention-queue page uses and filters client-side, so the two can
// never disagree about what counts as an open issue.
export default async function ClientSitePage({ params }: { params: Promise<{ id: string; siteId: string }> }) {
  const { id, siteId } = await params;
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');
  if (!portfolioIncludes(portfolio.organisations, id)) notFound();

  const sb = createServiceSupabaseClient();
  const { data: site } = await sb.from('hs_sites').select('id, name').eq('id', siteId).eq('company_id', id).maybeSingle();
  if (!site) notFound();

  const org = portfolio.organisations.find(o => o.organisation_id === id)!;
  const allItems = await loadAttentionQueue(portfolio);
  const items = allItems.filter(i => i.clientOrganisationId === id && i.siteId === siteId);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          <Link href={`/consultancy/clients/${id}`} className="hover:underline">{org.name}</Link>
        </p>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>{site.name}</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{items.length} open item{items.length === 1 ? '' : 's'} at this site</p>
      </div>

      {items.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><ListChecks size={28} style={{ color: 'var(--teal)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nothing needs attention at this site.</p></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Severity</th><th>Module</th><th>Issue</th><th>State</th><th>Due / age</th><th></th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.key}>
                  <td><span className="badge" style={{ background: SEVERITY_COLOR[item.severity], color: '#fff' }}>{item.severity}</span></td>
                  <td>{item.sourceModule}</td>
                  <td>{item.issueType}</td>
                  <td>{item.state}</td>
                  <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-GB') : item.ageDays != null ? `${item.ageDays}d` : '—'}</td>
                  <td>
                    <Link className="btn-ghost btn-sm" href={`/open-workspace?org=${item.clientOrganisationId}&next=${encodeURIComponent(item.link)}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
