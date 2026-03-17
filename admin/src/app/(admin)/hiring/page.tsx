import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import HiringStageUpdater from '@/components/modules/HiringStageUpdater';

export const metadata: Metadata = { title: 'Hiring Oversight' };

const stageBadge: Record<string,string> = { submitted:'badge-submitted',in_progress:'badge-inprogress',shortlist_ready:'badge-shortlist',interview:'badge-interview',offer:'badge-offer',filled:'badge-filled',cancelled:'badge-cancelled' };

export default async function AdminHiringPage() {
  const supabase = createServerSupabaseClient();
  const { data: reqs } = await supabase
    .from('requisitions')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const all    = reqs ?? [];
  const active = all.filter((r: any) => !['filled','cancelled'].includes(r.stage));
  const done   = all.filter((r: any) =>  ['filled','cancelled'].includes(r.stage));

  return (
    <>
      <AdminTopbar title="Hiring Oversight" subtitle={`${active.length} active role${active.length !== 1 ? 's' : ''}`} />
      <main className="admin-page flex-1">
        {active.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Active Roles</h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Role</th><th>Client</th><th>Seniority</th><th>Submitted</th><th>Stage</th><th>Update Stage</th></tr>
                </thead>
                <tbody>
                  {active.map((r: any) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.title}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.companies?.name}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.seniority ?? '—'}</td>
                      <td style={{ color: 'var(--ink-faint)' }}>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                      <td><span className={`badge ${stageBadge[r.stage]}`}>{r.stage.replace(/_/g,' ')}</span></td>
                      <td><HiringStageUpdater reqId={r.id} currentStage={r.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {done.length > 0 && (
          <section>
            <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>Filled &amp; Closed</h2>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Role</th><th>Client</th><th>Stage</th><th>Closed</th></tr></thead>
                <tbody>
                  {done.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.title}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{r.companies?.name}</td>
                      <td><span className={`badge ${stageBadge[r.stage]}`}>{r.stage}</span></td>
                      <td style={{ color: 'var(--ink-faint)' }}>{new Date(r.updated_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {all.length === 0 && (
          <div className="card p-12 empty-state">No requisitions submitted yet.</div>
        )}
      </main>
    </>
  );
}
