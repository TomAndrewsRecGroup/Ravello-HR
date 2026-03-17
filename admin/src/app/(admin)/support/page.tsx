import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Support' };

const prioBadge: Record<string,string>   = { urgent:'badge-urgent', high:'badge-high', normal:'badge-normal', low:'badge-normal' };
const statusBadge: Record<string,string> = { open:'badge-open', in_progress:'badge-inprogress', resolved:'badge-resolved', closed:'badge-normal' };

export default async function AdminSupportPage() {
  const supabase = createServerSupabaseClient();
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const all    = tickets ?? [];
  const open   = all.filter((t: any) => !['resolved','closed'].includes(t.status));
  const closed = all.filter((t: any) =>  ['resolved','closed'].includes(t.status));

  return (
    <>
      <AdminTopbar title="Support" subtitle={`${open.length} open ticket${open.length !== 1 ? 's' : ''}`} />
      <main className="admin-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12 empty-state">No tickets yet.</div>
        ) : (
          <div className="space-y-6">
            {open.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Open ({open.length})</h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Subject</th><th>Client</th><th>Priority</th><th>Status</th><th>Raised</th><th></th></tr></thead>
                    <tbody>
                      {open.map((t: any) => (
                        <tr key={t.id}>
                          <td className="font-medium">{t.subject}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{t.companies?.name}</td>
                          <td><span className={`badge ${prioBadge[t.priority]}`}>{t.priority}</span></td>
                          <td><span className={`badge ${statusBadge[t.status]}`}>{t.status.replace('_',' ')}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                          <td><Link href={`/support/${t.id}`} className="btn-cta btn-sm">Respond →</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>Resolved ({closed.length})</h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Subject</th><th>Client</th><th>Status</th><th>Resolved</th><th></th></tr></thead>
                    <tbody>
                      {closed.map((t: any) => (
                        <tr key={t.id}>
                          <td style={{ color: 'var(--ink-soft)' }}>{t.subject}</td>
                          <td style={{ color: 'var(--ink-soft)' }}>{t.companies?.name}</td>
                          <td><span className={`badge ${statusBadge[t.status]}`}>{t.status}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{t.resolved_at ? new Date(t.resolved_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td><Link href={`/support/${t.id}`} className="btn-ghost btn-sm">View</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
