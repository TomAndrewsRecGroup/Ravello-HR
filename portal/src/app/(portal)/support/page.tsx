import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { LifeBuoy, Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Support' };

const priorityBadge: Record<string,string> = { urgent:'badge-urgent', high:'badge-high', normal:'badge-normal', low:'badge-low' };
const statusBadge:   Record<string,string> = { open:'badge-open', in_progress:'badge-inprogress', resolved:'badge-resolved', closed:'badge-normal' };

export default async function SupportPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase.from('profiles').select('company_id').eq('id', user?.id ?? '').single();
  const companyId: string  = (profile as any)?.company_id ?? '';

  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const all    = tickets ?? [];
  const open   = all.filter((t: any) => !['resolved','closed'].includes(t.status));
  const closed = all.filter((t: any) =>  ['resolved','closed'].includes(t.status));

  return (
    <>
      <Topbar
        title="HR Support"
        subtitle={`${open.length} open ticket${open.length !== 1 ? 's' : ''}`}
        actions={
          <Link href="/support/new" className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={14} /> Raise a Query
          </Link>
        }
      />
      <main className="portal-page flex-1">
        {all.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <LifeBuoy size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No support tickets</p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                Raise a query and The People Office will respond within one business day.
              </p>
              <Link href="/support/new" className="btn-cta mt-2">Raise a Query</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {open.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>
                  Open <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>({open.length})</span>
                </h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>Subject</th><th>Priority</th><th>Status</th><th>Raised</th><th></th></tr>
                    </thead>
                    <tbody>
                      {open.map((t: any) => (
                        <tr key={t.id}>
                          <td><p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{t.subject}</p></td>
                          <td><span className={`badge ${priorityBadge[t.priority]}`}>{t.priority}</span></td>
                          <td><span className={`badge ${statusBadge[t.status]}`}>{t.status.replace('_',' ')}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                          <td><Link href={`/support/${t.id}`} className="btn-ghost btn-sm">View →</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>
                  Resolved <span className="font-normal">({closed.length})</span>
                </h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>Subject</th><th>Status</th><th>Resolved</th><th></th></tr>
                    </thead>
                    <tbody>
                      {closed.map((t: any) => (
                        <tr key={t.id}>
                          <td style={{ color: 'var(--ink-soft)' }}>{t.subject}</td>
                          <td><span className={`badge ${statusBadge[t.status]}`}>{t.status}</span></td>
                          <td style={{ color: 'var(--ink-faint)' }}>{t.resolved_at ? new Date(t.resolved_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td><Link href={`/support/${t.id}`} className="btn-ghost btn-sm">View →</Link></td>
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
