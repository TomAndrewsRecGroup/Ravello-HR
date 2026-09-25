import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { LifeBuoy, Plus, Headphones } from 'lucide-react';
import { SERVICE_REQUEST_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
import { slaHoursLeft } from '@/lib/support/sla';

export const metadata: Metadata = { title: 'Support' };
export const revalidate = 30;

const SR_STATUS_STYLE: Record<string, React.CSSProperties> = {
  new:         { background: 'rgba(11,120,150,0.12)', color: '#075E77' },
  in_progress: { background: 'rgba(59,111,255,0.12)', color: 'var(--blue)' },
  complete:    { background: 'rgba(52,211,153,0.14)', color: 'var(--emerald)' },
};

// `details` is the request-type-specific JSONB the form collected. The
// old page selected `type` and `message`, two columns service_requests
// never had, so the whole query failed and a client saw no requests.
function detailsText(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const d = details as Record<string, unknown>;
  const first = d.message ?? d.details ?? d.description ?? d.notes ?? Object.values(d).find(v => typeof v === 'string' && v.length > 0);
  return typeof first === 'string' ? first : '';
}

function humanType(type: string): string {
  return labelFor(SERVICE_REQUEST_TYPE_LABELS, type, type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '-');
}

/** "Response due in 3h" / "Response overdue": the SLA the platform set at insert. */
function slaText(slaDue: string | null, firstResponse: string | null, status: string): string | null {
  if (status === 'complete' || firstResponse) return null;
  const h = slaHoursLeft(slaDue);
  if (h == null) return null;
  if (h < 0) return 'Response overdue';
  return h < 1 ? 'Response due within the hour' : h < 48 ? `Response due in ${Math.round(h)}h` : `Response due in ${Math.round(h / 24)} days`;
}

export default async function SupportPage() {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  // service_requests is the one support object: `tickets` never had a
  // writer, so the "Open Tickets" section this page used to render could
  // only ever be empty.
  const { data: serviceRequests } = await supabase
    .from('service_requests')
    .select('id,request_type,subject,details,urgency,status,response_notes,responded_at,created_at,first_response_at,sla_due_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const srAll   = serviceRequests ?? [];
  const srOpen  = srAll.filter((r: any) => r.status !== 'complete');
  const srDone  = srAll.filter((r: any) => r.status === 'complete');

  const hasAnything = srAll.length > 0;

  return (
    <>
      <Topbar
        title="HR Support"
        subtitle={`${srOpen.length} open request${srOpen.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Link prefetch={false} href="/support/ivylens" className="btn-secondary btn-sm flex items-center gap-1.5">
              <Headphones size={13} /> IvyLens Support
            </Link>
            <Link prefetch={false} href="/support/new" className="btn-cta btn-sm flex items-center gap-1.5">
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
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No requests yet</p>
              <p className="text-sm max-w-[300px]" style={{ color: 'var(--ink-faint)' }}>
                Raise a query and Core OS 360 will respond within one business day.
              </p>
              <Link prefetch={false} href="/support/new" className="btn-cta mt-2">Raise a Query</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">

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
                                  {humanType(r.request_type)}
                                </span>
                                {slaText(r.sla_due_at, r.first_response_at, r.status) && (
                                  <span className="text-xs" style={{ color: slaText(r.sla_due_at, r.first_response_at, r.status)!.includes('overdue') ? 'var(--red)' : 'var(--ink-faint)' }}>
                                    · {slaText(r.sla_due_at, r.first_response_at, r.status)}
                                  </span>
                                )}
                              </div>
                              {r.subject && (
                                <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.subject}</p>
                              )}
                              {detailsText(r.details) && (
                                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--ink-soft)' }}>{detailsText(r.details)}</p>
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
                              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--emerald)' }}>
                                Response from Core OS 360
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
                              <td style={{ color: 'var(--ink-soft)' }}>{humanType(r.request_type)}</td>
                              <td style={{ color: 'var(--ink-soft)' }}>{r.subject ?? '-'}</td>
                              <td className="max-w-[280px]">
                                {r.response_notes
                                  ? <p className="truncate text-sm" style={{ color: 'var(--ink)' }}>{r.response_notes}</p>
                                  : <span style={{ color: 'var(--ink-faint)' }}>-</span>
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
