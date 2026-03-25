'use client';
import React, { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface Props {
  requests: any[];
}

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

function urgencyBadge(urgency: string): React.CSSProperties {
  switch (urgency?.toLowerCase()) {
    case 'urgent': return { background: 'rgba(217,68,68,0.10)',  color: '#B02020' };
    case 'high':   return { background: 'rgba(245,158,11,0.15)', color: '#8A5500' };
    case 'normal': return { background: 'rgba(59,111,255,0.12)', color: '#1848CC' };
    default:       return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

function statusBadge(status: string): React.CSSProperties {
  switch (status?.toLowerCase()) {
    case 'new':         return { background: 'rgba(124,58,237,0.12)', color: '#5A1EC0' };
    case 'in_progress':
    case 'in progress': return { background: 'rgba(59,111,255,0.12)', color: '#1848CC' };
    case 'complete':
    case 'completed':   return { background: 'rgba(52,211,153,0.14)', color: '#047857' };
    default:            return { background: 'rgba(7,11,29,0.07)',    color: '#38436A' };
  }
}

function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'in_progress': return 'In Progress';
    case 'complete':    return 'Complete';
    default:            return status?.charAt(0).toUpperCase() + status?.slice(1) ?? '—';
  }
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = ['All', 'New', 'In Progress', 'Complete'] as const;

export default function RequestsClient({ requests }: Props) {
  const supabase = createClient();
  const [filter,       setFilter]       = useState<string>('All');
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [localStatus,  setLocalStatus]  = useState<Record<string, string>>({});
  const [updating,     setUpdating]     = useState<string | null>(null);

  async function updateStatus(id: string, newStatus: string) {
    setUpdating(id);
    await supabase.from('service_requests').update({ status: newStatus }).eq('id', id);
    setLocalStatus(prev => ({ ...prev, [id]: newStatus }));
    setUpdating(null);
  }

  const filtered = useMemo(() => {
    return requests.filter(r => {
      const s = (localStatus[r.id] ?? r.status ?? '').toLowerCase();
      if (filter === 'All')         return true;
      if (filter === 'New')         return s === 'new';
      if (filter === 'In Progress') return s === 'in_progress' || s === 'in progress';
      if (filter === 'Complete')    return s === 'complete' || s === 'completed';
      return true;
    });
  }, [requests, filter, localStatus]);

  return (
    <>
      {/* Filter bar */}
      <div className="card p-4 mb-5 flex items-center gap-2">
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
                      <td className="font-medium">{r.companies?.name ?? '—'}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{humanType(r.type ?? r.request_type)}</td>
                      <td className="max-w-[220px]">
                        <p className="truncate" style={{ color: 'var(--ink)' }}>{r.subject ?? '—'}</p>
                      </td>
                      <td>
                        <span className="badge" style={urgencyBadge(r.urgency)}>
                          {r.urgency ? r.urgency.charAt(0).toUpperCase() + r.urgency.slice(1) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={statusBadge(currentStatus)}>
                          {statusLabel(currentStatus)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(r.created_at)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {currentStatus.toLowerCase() !== 'in_progress' && currentStatus.toLowerCase() !== 'in progress' && currentStatus.toLowerCase() !== 'complete' && (
                            <button
                              onClick={() => updateStatus(r.id, 'in_progress')}
                              disabled={updating === r.id}
                              className="btn-secondary btn-sm whitespace-nowrap"
                            >
                              {updating === r.id ? <Loader2 size={11} className="animate-spin" /> : 'Mark In Progress'}
                            </button>
                          )}
                          {currentStatus.toLowerCase() !== 'complete' && (
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
                        <td colSpan={8} style={{ background: 'var(--surface-soft)', padding: 0 }}>
                          <div className="px-6 py-4">
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
