import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { LifeBuoy, Plus, Headphones } from 'lucide-react';

export const metadata: Metadata = { title: 'Support' };

const priorityBadge: Record<string,string> = { urgent:'badge-urgent', high:'badge-high', normal:'badge-normal', low:'badge-low' };
const statusBadge:   Record<string,string> = { open:'badge-open', in_progress:'badge-inprogress', resolved:'badge-resolved', closed:'badge-normal' };

const SR_STATUS_STYLE: Record<string, React.CSSProperties> = {
  new:         { background: 'rgba(124,58,237,0.12)', color: '#5A1EC0' },
  in_progress: { background: 'rgba(59,111,255,0.12)', color: '#1848CC' },
  complete:    { background: 'rgba(52,211,153,0.14)', color: '#047857' },
};

const TYPE_LABELS: Record<string, string> = {
  policy_update:       'Policy Update',
  salary_benchmark:    'Salary Benchmark',
  onboarding_support:  'Onboarding Support',
  offboarding_support: 'Offboarding Support',
  hr_advice:           'HR Advice',
  contract_review:     'Contract Review',
  compliance_check:    'Compliance Check',
  training_request:    'Training Request',
  recruitment_support: 'Recruitment Support',
  general_enquiry:     'General Enquiry',
};

function humanType(type: string): string {
  return TYPE_LABELS[type] ?? type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';
}

export default async function SupportPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase.from('profiles').select('company_id').eq('id', user?.id ?? '').single();
  const companyId: string  = (profile as any)?.company_id ?? '';

  const [{ data: tickets }, { data: serviceRequests }] = await Promise.all([
    supabase
      .from('tickets')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('service_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ]);

  const all     = tickets ?? [];
  const open    = all.filter((t: any) => !['resolved','closed'].includes(t.status));
  const closed  = all.filter((t: any) =>  ['resolved','closed'].includes(t.status));
  const srAll   = serviceRequests ?? [];
  const srOpen  = srAll.filter((r: any) => r.status !== 'complete');
  const srDone  = srAll.filter((r: any) => r.status === 'complete');

  const hasAnything = all.length > 0 || srAll.length > 0;

  return (
    <>
      <Topbar
        title="HR Support"
        subtitle={`${open.length} open ticket${open.length !== 1 ? 's' : ''}${srOpen.length > 0 ? ` · ${srOpen.length} service request${srOpen.length !== 1 ? 's' : ''}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/support/ivylens" className="btn-secondary btn-sm flex items-center gap-1.5">
              <Headphones size={13} /> IvyLens Support
            </Link>
            <Link href="/support/new" className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={14} /> Raise a Query
            </Link>
          </div>
        }
      />
      <main className="portal-page flex-1">
        {!hasAnything ? (
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
          <div className="space-y-8">

            {/* ── Support Tickets ── */}
            {all.length > 0 && (
              <div className="space-y-6">
                {open.length > 0 && (
                  <section>
                    <h2 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>
                      Open Tickets <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>({open.length})</span>
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
                      Resolved Tickets <span className="font-normal">({closed.length})</span>
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

            {/* ── Service Requests ── */}
            {srAll.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                    Service Requests
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>({srAll.length})</span>
                </div>

                {srOpen.length > 0 && (
                  <section>
                    <h3 className="font-display font-semibold text-xs mb-3" style={{ color: 'var(--ink-soft)' }}>
                      In Progress
                    </h3>
                    <div className="space-y-3">
                      {srOpen.map((r: any) => (
                        <div
                          key={r.id}
                          className="card p-5"
                          style={{ borderLeft: '3px solid var(--purple)' }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className="badge"
                                  style={SR_STATUS_STYLE[r.status] ?? SR_STATUS_STYLE['new']}
                                >
                                  {r.status === 'in_progress' ? 'In Progress' : r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                                  {humanType(r.type ?? r.request_type)}
                                </span>
                              </div>
                              {r.subject && (
                                <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.subject}</p>
                              )}
                              {r.message && (
                                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--ink-soft)' }}>{r.message}</p>
                              )}
                            </div>
                            <p className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                              {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>

                          {r.response_notes && (
                            <div
                              className="mt-4 p-3 rounded-[8px]"
                              style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}
                            >
                              <p className="text-xs font-semibold mb-1" style={{ color: '#047857' }}>
                                Response from The People Office
                              </p>
                              <p className="text-sm" style={{ color: 'var(--ink)' }}>{r.response_notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {srDone.length > 0 && (
                  <section>
                    <h3 className="font-display font-semibold text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>
                      Completed
                    </h3>
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr><th>Type</th><th>Subject</th><th>Response</th><th>Completed</th></tr>
                        </thead>
                        <tbody>
                          {srDone.map((r: any) => (
                            <tr key={r.id}>
                              <td style={{ color: 'var(--ink-soft)' }}>{humanType(r.type ?? r.request_type)}</td>
                              <td style={{ color: 'var(--ink-soft)' }}>{r.subject ?? '—'}</td>
                              <td className="max-w-[280px]">
                                {r.response_notes
                                  ? <p className="truncate text-sm" style={{ color: 'var(--ink)' }}>{r.response_notes}</p>
                                  : <span style={{ color: 'var(--ink-faint)' }}>—</span>
                                }
                              </td>
                              <td style={{ color: 'var(--ink-faint)' }}>
                                {r.responded_at
                                  ? new Date(r.responded_at).toLocaleDateString('en-GB')
                                  : new Date(r.created_at).toLocaleDateString('en-GB')
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}

          </div>
        )}
      </main>
    </>
  );
}
