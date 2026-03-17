import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { Briefcase, Plus } from 'lucide-react';
import type { HiringStage } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Hiring' };

const STAGES: { key: HiringStage; label: string }[] = [
  { key: 'submitted',       label: 'Submitted' },
  { key: 'in_progress',     label: 'In Progress' },
  { key: 'shortlist_ready', label: 'Shortlist Ready' },
  { key: 'interview',       label: 'Interview' },
  { key: 'offer',           label: 'Offer' },
  { key: 'filled',          label: 'Filled' },
];

const stageBadge: Record<string, string> = {
  submitted: 'badge-submitted', in_progress: 'badge-inprogress',
  shortlist_ready: 'badge-shortlist', interview: 'badge-interview',
  offer: 'badge-offer', filled: 'badge-filled', cancelled: 'badge-cancelled',
};

export default async function HiringPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user?.id ?? '').single();
  const companyId: string | undefined = (profile as any)?.company_id;

  const { data: requisitions } = await supabase
    .from('requisitions')
    .select('*')
    .eq('company_id', companyId ?? '')
    .order('created_at', { ascending: false });

  const reqs = requisitions ?? [];
  const active   = reqs.filter((r: any) => !['filled','cancelled'].includes(r.stage));
  const archived = reqs.filter((r: any) =>  ['filled','cancelled'].includes(r.stage));

  return (
    <>
      <Topbar
        title="Hiring"
        subtitle={`${active.length} active role${active.length !== 1 ? 's' : ''}`}
        actions={
          <Link href="/hiring/new" className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={14} /> Submit a Role
          </Link>
        }
      />

      <main className="portal-page flex-1">

        {/* Pipeline columns */}
        {active.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="empty-state">
              <Briefcase size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No active roles</p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                Submit a hiring requirement and Ravello will coordinate sourcing through our specialist recruiter network.
              </p>
              <Link href="/hiring/new" className="btn-cta mt-2">Submit a Role</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Kanban-style stage view */}
            <div className="overflow-x-auto pb-4">
              <div className="inline-flex gap-4 min-w-full">
                {STAGES.filter(s => !['filled','cancelled'].includes(s.key)).map((stage) => {
                  const cols = active.filter((r: any) => r.stage === stage.key);
                  return (
                    <div key={stage.key} className="flex-shrink-0 w-[220px]">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span className={`badge ${stageBadge[stage.key]}`}>{stage.label}</span>
                        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{cols.length}</span>
                      </div>
                      <div className="space-y-2">
                        {cols.map((r: any) => (
                          <Link
                            key={r.id}
                            href={`/hiring/${r.id}`}
                            className="card card-hover p-4 block"
                          >
                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>{r.title}</p>
                            {r.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>}
                            {r.salary_range && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{r.salary_range}</p>}
                          </Link>
                        ))}
                        {cols.length === 0 && (
                          <div className="rounded-[10px] p-4 text-center text-xs" style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)', border: '1px dashed var(--line)' }}>
                            None
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active list view */}
            <div className="mt-8">
              <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>All Active Roles</h2>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Seniority</th>
                      <th>Salary</th>
                      <th>Stage</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((r: any) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/hiring/${r.id}`} className="font-medium hover:underline" style={{ color: 'var(--purple)' }}>
                            {r.title}
                          </Link>
                        </td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.department ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.seniority ?? '—'}</td>
                        <td style={{ color: 'var(--ink-soft)' }}>{r.salary_range ?? '—'}</td>
                        <td><span className={`badge ${stageBadge[r.stage]}`}>{r.stage.replace(/_/g,' ')}</span></td>
                        <td style={{ color: 'var(--ink-faint)' }}>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Archived */}
        {archived.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink-faint)' }}>Filled &amp; Closed</h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Role</th><th>Stage</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {archived.map((r: any) => (
                    <tr key={r.id}>
                      <td><Link href={`/hiring/${r.id}`} className="hover:underline" style={{ color: 'var(--ink)' }}>{r.title}</Link></td>
                      <td><span className={`badge ${stageBadge[r.stage]}`}>{r.stage}</span></td>
                      <td style={{ color: 'var(--ink-faint)' }}>{new Date(r.updated_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
