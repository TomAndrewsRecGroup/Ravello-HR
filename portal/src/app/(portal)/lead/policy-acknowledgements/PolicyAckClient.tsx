'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Plus, X, Loader2, CheckCircle2, Clock, AlertTriangle,
  FileText, Send, Users, Filter,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface Document { id: string; name: string; category: string; version: number; }
interface Employee { id: string; full_name: string; job_title: string; email: string | null; }
interface Acknowledgement {
  id: string; document_id: string; employee_id: string; company_id: string;
  status: string; acknowledged_at: string | null; sent_at: string;
  acknowledged_via: string | null; link_sent_at: string | null;
  documents: { name: string; category: string; version: number } | null;
  employee_records: { full_name: string; job_title: string; email: string | null } | null;
}

interface Props {
  companyId: string; isAdmin: boolean;
  documents: Document[]; acknowledgements: Acknowledgement[]; employees: Employee[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  pending:      { label: 'Pending',      bg: 'rgba(245,158,11,0.12)', color: '#92400E', icon: Clock },
  acknowledged: { label: 'Signed',       bg: 'rgba(52,211,153,0.12)', color: 'var(--emerald)', icon: CheckCircle2 },
  overdue:      { label: 'Overdue',      bg: 'rgba(217,68,68,0.08)',  color: 'var(--rose)', icon: AlertTriangle },
};

/* ─── Component ─────────────────────────────────────── */
export default function PolicyAckClient({ companyId, isAdmin, documents, acknowledgements, employees }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [docFilter, setDocFilter] = useState<string>('all');
  const [sentNote, setSentNote] = useState('');
  const [resending, setResending] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<Record<string, { ok: boolean; text: string }>>({});

  // Stats
  const pending = acknowledgements.filter(a => a.status === 'pending').length;
  const signed = acknowledgements.filter(a => a.status === 'acknowledged').length;
  const overdue = acknowledgements.filter(a => a.status === 'overdue').length;

  // Filtered acks
  const filtered = useMemo(() => {
    return acknowledgements.filter(a => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (docFilter !== 'all' && a.document_id !== docFilter) return false;
      return true;
    });
  }, [acknowledgements, filter, docFilter]);

  // Group by document
  const byDocument = useMemo(() => {
    const map: Record<string, { doc: Document; acks: Acknowledgement[] }> = {};
    for (const ack of filtered) {
      if (!map[ack.document_id]) {
        const doc = documents.find(d => d.id === ack.document_id);
        if (doc) map[ack.document_id] = { doc, acks: [] };
      }
      map[ack.document_id]?.acks.push(ack);
    }
    return Object.values(map);
  }, [filtered, documents]);

  /* ─── Send acknowledgement requests ──────────────── */
  async function sendRequests() {
    if (!selectedDoc || selectedEmployees.length === 0) return;
    setSaving(true);

    const inserts = selectedEmployees.map(empId => ({
      company_id: companyId,
      document_id: selectedDoc,
      employee_id: empId,
      status: 'pending',
      sent_at: new Date().toISOString(),
    }));

    // The row is the request. The platform's consumer emails each employee
    // a personal link within a few minutes (lib/events/leadRules.ts);
    // an employee with no email on file gets no link, and you are told.
    const { error } = await supabase.from('policy_acknowledgements').upsert(inserts, { onConflict: 'document_id,employee_id' });

    setSaving(false);
    if (!error) {
      const withEmail = employees.filter(e => selectedEmployees.includes(e.id) && !!e.email?.trim()).length;
      const without = selectedEmployees.length - withEmail;
      setSentNote(`Requested for ${selectedEmployees.length} employee${selectedEmployees.length === 1 ? '' : 's'}. ${withEmail} will be emailed a personal link within a few minutes${without > 0 ? `; ${without} ${without === 1 ? 'has' : 'have'} no email address on their record and will not receive one` : ''}.`);
      setShowSendForm(false);
      setSelectedDoc(''); setSelectedEmployees([]);
      revalidatePortalPath('/lead/policy-acknowledgements');
    }
  }

  /* ─── Resend the link (a fresh one is emailed by the platform) ── */
  async function resendLink(ackId: string) {
    setResending(ackId);
    setResendNote(prev => { const n = { ...prev }; delete n[ackId]; return n; });
    try {
      const res = await fetch(`/api/portal/policy-acks/${ackId}/resend`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      setResendNote(prev => ({ ...prev, [ackId]: res.ok ? { ok: true, text: 'A fresh link will be emailed within a few minutes.' } : { ok: false, text: data.error ?? 'Could not resend.' } }));
    } catch {
      setResendNote(prev => ({ ...prev, [ackId]: { ok: false, text: 'Network error. Nothing was sent.' } }));
    } finally {
      setResending(null);
    }
  }

  /* ─── Mark as acknowledged (admin on behalf) ─────── */
  async function markAcknowledged(ackId: string) {
    const { error } = await supabase.from('policy_acknowledgements').update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_via: 'admin',
    }).eq('id', ackId);
    if (!error) revalidatePortalPath('/lead/policy-acknowledgements');
  }

  /* ─── Send to all employees ──────────────────────── */
  function selectAllEmployees() {
    setSelectedEmployees(employees.map(e => e.id));
  }

  function toggleEmployee(empId: string) {
    setSelectedEmployees(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Policy Sign-off</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Track employee acknowledgement of policies, handbooks and contracts
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowSendForm(true)} className="btn-cta btn-sm" disabled={documents.length === 0}>
            <Send size={13} /> Request Sign-off
          </button>
        )}
      </div>

      {sentNote && <p role="status" className="text-xs mb-4 p-3 rounded-lg" style={{ background: 'rgba(20,184,166,0.08)', color: 'var(--ink-soft)' }}>{sentNote}</p>}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>Pending</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#92400E' }}>{pending}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--emerald)' }}>Signed</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--emerald)' }}>{signed}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(217,68,68,0.04)', border: '1px solid rgba(217,68,68,0.12)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--rose)' }}>Overdue</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--rose)' }}>{overdue}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select className="input w-auto" style={{ minWidth: 130 }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="acknowledged">Signed</option>
          <option value="overdue">Overdue</option>
        </select>
        <select className="input w-auto" style={{ minWidth: 180 }} value={docFilter} onChange={e => setDocFilter(e.target.value)}>
          <option value="all">All Documents</option>
          {documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Acknowledgements grouped by document */}
      {byDocument.length === 0 ? (
        <div className="empty-state">
          <FileText size={28} />
          <p className="text-sm font-medium">No acknowledgement requests</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {documents.length === 0
              ? 'Upload policies or handbooks first under Documents.'
              : 'Send a sign-off request to employees.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byDocument.map(({ doc, acks }) => {
            const docSigned = acks.filter(a => a.status === 'acknowledged').length;
            const docTotal = acks.length;

            return (
              <div key={doc.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileText size={16} style={{ color: 'var(--purple)' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{doc.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                        {doc.category} · v{doc.version} · {docSigned}/{docTotal} signed
                      </p>
                    </div>
                  </div>
                  <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                    <div className="h-full rounded-full" style={{
                      width: docTotal > 0 ? `${Math.round((docSigned / docTotal) * 100)}%` : '0%',
                      background: docSigned === docTotal ? 'var(--success)' : 'var(--purple)',
                    }} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {acks.map(ack => {
                    const st = STATUS_CONFIG[ack.status] ?? STATUS_CONFIG.pending;
                    const StIcon = st.icon;
                    return (
                      <div key={ack.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                        <div className="flex items-center gap-2">
                          <StIcon size={13} style={{ color: st.color }} />
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                              {(ack.employee_records as any)?.full_name ?? 'Employee'}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                              {(ack.employee_records as any)?.job_title}
                              {ack.acknowledged_at
                                ? ` · Signed ${new Date(ack.acknowledged_at).toLocaleDateString('en-GB')}${ack.acknowledged_via === 'admin' ? ' (on their behalf)' : ack.acknowledged_via === 'link' ? ' via their link' : ''}`
                                : ack.link_sent_at
                                  ? ` · Link emailed ${new Date(ack.link_sent_at).toLocaleDateString('en-GB')}`
                                  : (ack.employee_records as any)?.email
                                    ? ` · Requested ${new Date(ack.sent_at).toLocaleDateString('en-GB')} · link on its way`
                                    : ` · Requested ${new Date(ack.sent_at).toLocaleDateString('en-GB')} · no email on record`}
                            </p>
                            {resendNote[ack.id] && <p role="status" className="text-[10px] mt-0.5" style={{ color: resendNote[ack.id].ok ? 'var(--teal)' : 'var(--red)' }}>{resendNote[ack.id].text}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {isAdmin && (ack.status === 'pending' || ack.status === 'overdue') && (
                            <button
                              onClick={() => resendLink(ack.id)}
                              disabled={resending === ack.id || !(ack.employee_records as any)?.email}
                              title={(ack.employee_records as any)?.email ? 'Email a fresh personal link' : 'Add an email address to their employee record first'}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1"
                              style={{ background: 'rgba(11,120,150,0.10)', color: 'var(--purple)' }}
                            >
                              {resending === ack.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Resend link
                            </button>
                          )}
                          {isAdmin && ack.status === 'pending' && (
                            <button
                              onClick={() => markAcknowledged(ack.id)}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                              style={{ background: 'rgba(52,211,153,0.10)', color: 'var(--emerald)' }}
                              title="Mark as signed (on behalf of employee)"
                            >
                              Mark Signed
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Send Sign-off Request Modal ───────────────── */}
      {showSendForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowSendForm(false)} />
          <div className="relative card p-6 w-full max-w-lg" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Request Policy Sign-off</h3>
              <button onClick={() => setShowSendForm(false)} className="btn-icon" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Document *</label>
                <select className="input" value={selectedDoc} onChange={e => setSelectedDoc(e.target.value)}>
                  <option value="">Select a policy/handbook...</option>
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.category} v{d.version})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Employees *</label>
                  <button onClick={selectAllEmployees} className="text-[10px] font-bold" style={{ color: 'var(--purple)' }}>
                    Select All ({employees.length})
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
                  {employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface-soft)] transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                        className="w-3.5 h-3.5 rounded"
                      />
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{emp.full_name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{emp.job_title}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                  {selectedEmployees.length} selected
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowSendForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={sendRequests} disabled={saving || !selectedDoc || selectedEmployees.length === 0} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                Send to {selectedEmployees.length} employee{selectedEmployees.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
