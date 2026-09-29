import type { Metadata } from 'next';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import { loadAttentionQueue } from '@/lib/consultancy/loadAttentionQueue';
import type { QueueSeverity } from '@/lib/consultancy/attentionQueue';

export const metadata: Metadata = { title: 'Attention Queue' };
export const dynamic = 'force-dynamic';

const SEVERITY_COLOR: Record<QueueSeverity, string> = {
  critical: 'var(--red)', high: 'var(--gold)', medium: 'var(--blue)', low: 'var(--ink-faint)',
};

// Core-OS 360 Phase 6, section 3. A cross-client operational VIEW — it
// never duplicates the underlying record, only links to it. Every link
// goes through /open-workspace so an item never opens under the wrong
// active organisation (section 12: client switcher hardening).
export default async function AttentionQueuePage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const items = await loadAttentionQueue(portfolio);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Attention Queue</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{items.length} item{items.length === 1 ? '' : 's'} across your authorised clients</p>
      </div>

      {items.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><ListChecks size={28} style={{ color: 'var(--teal)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nothing needs attention right now.</p></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th><th>Client</th><th>Module</th><th>Issue</th><th>State</th><th>Due / age</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.key}>
                  <td><span className="badge" style={{ background: SEVERITY_COLOR[item.severity], color: '#fff' }}>{item.severity}</span></td>
                  <td>{item.clientName}</td>
                  <td>{item.sourceModule}</td>
                  <td>{item.issueType}</td>
                  <td>{item.state}</td>
                  <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-GB') : item.ageDays != null ? `${item.ageDays}d` : '—'}</td>
                  <td>
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/open-workspace?org=${item.clientOrganisationId}&next=${encodeURIComponent(item.link)}`}
                    >
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
