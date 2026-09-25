'use client';
import React, { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { ChevronDown, ChevronRight, Loader2, Save, Sparkles } from 'lucide-react';
import { SERVICE_REQUEST_TYPES, SERVICE_REQUEST_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
import { SR_ROUTES, SR_TRIAGE_CATEGORIES, type SrTriage } from '@/lib/support/jevQuestions';
import { slaHoursLeft } from '@/lib/support/sla';

interface Props {
  requests: any[];
}

function humanType(type: string): string {
  return labelFor(SERVICE_REQUEST_TYPE_LABELS, type, type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '-');
}

// Jev's read of the request: shown, sorted on, never acted on. The
// consumer wrote `triage`; status, urgency and the SLA are untouched by
// it (supportRules.test.ts pins that).
const URGENCY_RANK: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
function suggestedUrgency(r: any): string | null {
  const t = r.triage as SrTriage | null;
  return t && !t.gated && t.urgency ? t.urgency : null;
}
function effectiveUrgency(r: any): number {
  return URGENCY_RANK[suggestedUrgency(r) ?? (r.priority ?? r.urgency ?? 'normal').toString().toLowerCase()] ?? 1;
}

function TriageChips({ r }: { r: any }) {
  const t = r.triage as SrTriage | null;
  if (!t) return null;
  if (t.gated) return <span className="badge" title="Jev was not confident enough to suggest" style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}><Sparkles size={10} /> Unsure</span>;
  const parts: string[] = [];
  if (t.urgency) parts.push(t.urgency);
  if (t.category && t.category !== r.request_type) parts.push(labelFor(SR_TRIAGE_CATEGORIES as Record<string, string>, t.category, t.category).toLowerCase());
  if (t.route) parts.push(labelFor(SR_ROUTES as Record<string, string>, t.route, t.route).toLowerCase());
  if ((t.needs_call ?? 0) >= 0.8) parts.push('call');
  const unhappy = (t.dissatisfaction ?? 0) >= 0.8;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="badge" title={`Jev suggests${t.confidence != null ? ` (${Math.round(t.confidence * 100)}% sure)` : ''}`} style={{ background: 'rgba(11,120,150,0.10)', color: 'var(--purple)' }}>
        <Sparkles size={10} /> {parts.join(' · ') || 'no change'}
      </span>
      {unhappy && <span className="badge" style={{ background: 'rgba(217,68,68,0.10)', color: 'var(--rose)' }}>may be unhappy</span>}
    </span>
  );
}

/** The SLA clock, set by the database at insert. */
function SlaCell({ r, status }: { r: any; status: string }) {
  if (status === 'complete' || r.first_response_at) return <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.first_response_at ? 'Responded' : '-'}</span>;
  const h = slaHoursLeft(r.sla_due_at);
  if (h == null) return <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>-</span>;
  if (h < 0) return <span className="badge" style={{ background: 'rgba(217,68,68,0.10)', color: 'var(--rose)' }}>Overdue {Math.round(-h)}h</span>;
  const soon = h <= 4;
  return <span className="text-xs font-medium" style={{ color: soon ? 'var(--amber)' : 'var(--ink-soft)' }}>{h < 1 ? '<1h' : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`} left</span>;
}

function urgencyBadge(urgency: string): React.CSSProperties {
  switch (urgency?.toLowerCase()) {
    case 'urgent': return { background: 'rgba(217,68,68,0.10)',  color: 'var(--rose)' };
    case 'high':   return { background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' };
    case 'normal': return { background: 'rgba(59,111,255,0.12)', color: 'var(--blue)' };
    default:       return { background: 'rgba(7,11,29,0.07)',    color: 'var(--ink-soft)' };
  }
}

function statusBadge(status: string): React.CSSProperties {
  switch (status?.toLowerCase()) {
    case 'new':         return { background: 'rgba(11,120,150,0.12)', color: 'var(--purple)' };
    case 'in_progress':
    case 'in progress': return { background: 'rgba(59,111,255,0.12)', color: 'var(--blue)' };
    case 'complete':
    case 'completed':   return { background: 'rgba(52,211,153,0.14)', color: 'var(--emerald)' };
    default:            return { background: 'rgba(7,11,29,0.07)',    color: 'var(--ink-soft)' };
  }
}

function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'in_progress': return 'In Progress';
    case 'complete':    return 'Complete';
    default:            return status ? status.charAt(0).toUpperCase() + status.slice(1) : '-';
  }
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = ['All', 'New', 'In Progress', 'Complete'] as const;

export default function RequestsClient({ requests }: Props) {
  const supabase = createClient();
  const [filter,        setFilter]        = useState<string>('All');
  const [typeFilter,    setTypeFilter]    = useState<string>('all');
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [localStatus,   setLocalStatus]   = useState<Record<string, string>>({});
  const [updating,      setUpdating]      = useState<string | null>(null);
  const [responseNotes, setResponseNotes] = useState<Record<string, string>>({});
  const [savingNotes,   setSavingNotes]   = useState<string | null>(null);
  const [savedNotes,    setSavedNotes]    = useState<Record<string, boolean>>({});
  const [sendResult,    setSendResult]    = useState<Record<string, { ok: boolean; message: string }>>({});

  async function updateStatus(id: string, newStatus: string) {
    setUpdating(id);
    const update: Record<string, any> = { status: newStatus };
    if (newStatus === 'complete') update.responded_at = new Date().toISOString();
    const { error } = await supabase.from('service_requests').update(update).eq('id', id);
    if (!error) {
      setLocalStatus(prev => ({ ...prev, [id]: newStatus }));
      revalidateAdminPath('/requests');
    }
    setUpdating(null);
  }

  async function saveResponse(id: string) {
    setSavingNotes(id);
    const { error } = await supabase
      .from('service_requests')
      .update({ response_notes: responseNotes[id] ?? '' })
      .eq('id', id);
    if (!error) {
      setSavedNotes(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setSavedNotes(prev => ({ ...prev, [id]: false })), 2000);
      revalidateAdminPath('/requests');
    }
    setSavingNotes(null);
  }

  // Completing goes through the server so the client is EMAILED their
  // response — this used to be a bare update that closed the request
  // and told nobody. The route reports whether the email actually went.
  async function completeWithResponse(id: string, currentNotes: string) {
    setSavingNotes(id);
    setSendResult(prev => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const res = await fetch(`/api/admin/service-requests/${id}/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response_notes: responseNotes[id] ?? currentNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendResult(prev => ({ ...prev, [id]: { ok: false, message: data.error ?? 'Could not complete the request.' } }));
        return;
      }
      setLocalStatus(prev => ({ ...prev, [id]: 'complete' }));
      setSendResult(prev => ({ ...prev, [id]: data.email_error
        ? { ok: false, message: data.email_error }
        : { ok: true,  message: `Completed — the client was emailed your response.` } }));
      revalidateAdminPath('/requests');
    } catch {
      setSendResult(prev => ({ ...prev, [id]: { ok: false, message: 'Network error — nothing was sent. Try again.' } }));
    } finally {
      setSavingNotes(null);
    }
  }

  const typesPresent = useMemo(() => {
    const seen = new Set<string>(requests.map(r => String(r.request_type ?? '')));
    return [...SERVICE_REQUEST_TYPES.filter(t => seen.has(t)), ...[...seen].filter(t => t && !(SERVICE_REQUEST_TYPES as readonly string[]).includes(t))];
  }, [requests]);

  // Open requests sort by the urgency Jev suggests (else the stored
  // priority), then by age; completed ones by date.
  const filtered = useMemo(() => {
    const rows = requests.filter(r => {
      const s = (localStatus[r.id] ?? r.status ?? '').toLowerCase();
      if (typeFilter !== 'all' && r.request_type !== typeFilter) return false;
      if (filter === 'All')         return true;
      if (filter === 'New')         return s === 'new';
      if (filter === 'In Progress') return s === 'in_progress' || s === 'in progress';
      if (filter === 'Complete')    return s === 'complete' || s === 'completed';
      return true;
    });
    const isOpen = (r: any) => !['complete', 'completed'].includes((localStatus[r.id] ?? r.status ?? '').toLowerCase());
    return rows.sort((a, b) => (Number(isOpen(b)) - Number(isOpen(a))) || (effectiveUrgency(b) - effectiveUrgency(a)) || String(a.created_at).localeCompare(String(b.created_at)));
  }, [requests, filter, typeFilter, localStatus]);

  return (
    <>
      {/* Filter bar */}
      <div className="card p-4 mb-5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>Status:</span>
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-cta' : 'btn-secondary'}`}
          >
            {f}
          </button>
        ))}
        <span className="text-xs font-semibold ml-3" style={{ color: 'var(--ink-soft)' }}>Type:</span>
        <select className="input text-xs py-1.5 w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter by request type">
          <option value="all">All types</option>
          {typesPresent.map(t => <option key={t} value={t}>{humanType(t)}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card empty-state">No service requests match this filter.</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th>Client</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Urgency</th>
                <th>SLA</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const currentStatus = localStatus[r.id] ?? r.status ?? 'new';
                const isExpanded    = expanded === r.id;
                const details       = r.details ?? r.request_details ?? null;
                const isComplete    = currentStatus.toLowerCase() === 'complete' || currentStatus.toLowerCase() === 'completed';
                const notesVal      = responseNotes[r.id] ?? r.response_notes ?? '';

                return (
                  <React.Fragment key={r.id}>
                    <tr
                      className="cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : r.id)}
                    >
                      <td>
                        {isExpanded
                          ? <ChevronDown size={14} style={{ color: 'var(--purple)' }} />
                          : <ChevronRight size={14} style={{ color: 'var(--ink-faint)' }} />
                        }
                      </td>
                      <td className="font-medium">{r.companies?.name ?? '-'}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{humanType(r.type ?? r.request_type)}</td>
                      <td className="max-w-[260px]">
                        <p className="truncate" style={{ color: 'var(--ink)' }}>{r.subject ?? '-'}</p>
                        <TriageChips r={r} />
                      </td>
                      <td>
                        <span className="badge" style={urgencyBadge(r.urgency)}>
                          {r.urgency ? r.urgency.charAt(0).toUpperCase() + r.urgency.slice(1) : '-'}
                        </span>
                      </td>
                      <td><SlaCell r={r} status={currentStatus} /></td>
                      <td>
                        <span className="badge" style={statusBadge(currentStatus)}>
                          {statusLabel(currentStatus)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(r.created_at)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {!isComplete && currentStatus.toLowerCase() !== 'in_progress' && currentStatus.toLowerCase() !== 'in progress' && (
                            <button
                              onClick={() => updateStatus(r.id, 'in_progress')}
                              disabled={updating === r.id}
                              className="btn-secondary btn-sm whitespace-nowrap"
                            >
                              {updating === r.id ? <Loader2 size={11} className="animate-spin" /> : 'Mark In Progress'}
                            </button>
                          )}
                          {!isComplete && (
                            <button
                              onClick={() => updateStatus(r.id, 'complete')}
                              disabled={updating === r.id}
                              className="btn-cta btn-sm"
                            >
                              {updating === r.id ? <Loader2 size={11} className="animate-spin" /> : 'Complete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--surface-soft)', padding: 0 }}>
                          <div className="px-6 py-4 space-y-5">

                            {/* Request details */}
                            <div>
                              <h4 className="font-display font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                                Request Details
                              </h4>
                              {details ? (
                                typeof details === 'object' ? (
                                  <div className="grid sm:grid-cols-2 gap-3">
                                    {Object.entries(details).map(([key, val]) => (
                                      <div key={key} className="p-3 rounded-[8px] bg-white border" style={{ borderColor: 'var(--line)' }}>
                                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-faint)' }}>
                                          {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </p>
                                        <p className="text-sm" style={{ color: 'var(--ink)' }}>
                                          {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <pre className="text-sm p-4 rounded-[8px] bg-white border overflow-auto" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
                                    {String(details)}
                                  </pre>
                                )
                              ) : (
                                <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No additional details provided.</p>
                              )}

                              {r.message && (
                                <div className="mt-4">
                                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-faint)' }}>Message</p>
                                  <p className="text-sm p-3 rounded-[8px] bg-white border" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>{r.message}</p>
                                </div>
                              )}
                            </div>

                            {/* Response notes */}
                            <div className="border-t pt-4" style={{ borderColor: 'var(--line)' }}>
                              <h4 className="font-display font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>
                                Response / Notes for Client
                              </h4>
                              <textarea
                                className="input h-24 resize-none"
                                placeholder="Add a response or internal notes visible to the client once shared…"
                                value={notesVal}
                                onChange={e => setResponseNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                                disabled={isComplete}
                              />
                              {!isComplete && (
                                <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => saveResponse(r.id)}
                                    disabled={savingNotes === r.id}
                                    className="btn-secondary btn-sm flex items-center gap-1.5"
                                  >
                                    {savingNotes === r.id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <Save size={11} />
                                    }
                                    {savedNotes[r.id] ? 'Saved!' : 'Save Notes'}
                                  </button>
                                  <button
                                    onClick={() => completeWithResponse(r.id, notesVal)}
                                    disabled={savingNotes === r.id || !notesVal.trim()}
                                    title={!notesVal.trim() ? 'Write a response first — it is emailed to the client' : undefined}
                                    className="btn-cta btn-sm"
                                  >
                                    {savingNotes === r.id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : 'Complete & Email Client'
                                    }
                                  </button>
                                </div>
                              )}
                              {sendResult[r.id] && (
                                <p className="text-xs mt-2" role="status" style={{ color: sendResult[r.id].ok ? 'var(--teal)' : 'var(--red)' }}>
                                  {sendResult[r.id].message}
                                </p>
                              )}
                              {isComplete && notesVal && !sendResult[r.id] && (
                                <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                                  Response saved on this request. See the client&rsquo;s email log for delivery.
                                </p>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
