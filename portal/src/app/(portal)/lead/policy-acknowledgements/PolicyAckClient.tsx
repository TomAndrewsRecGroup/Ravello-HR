'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Loader2, CheckCircle2, Clock, AlertTriangle,
  FileText, Send, Users, Filter,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface Document { id: string; name: string; category: string; version: number; }
interface Employee { id: string; full_name: string; job_title: string; }
interface Acknowledgement {
  id: string; document_id: string; employee_id: string; company_id: string;
  status: string; acknowledged_at: string | null; sent_at: string;
  documents: { name: string; category: string; version: number } | null;
  employee_records: { full_name: string; job_title: string } | null;
}

interface Props {
  companyId: string; isAdmin: boolean;
  documents: Document[]; acknowledgements: Acknowledgement[]; employees: Employee[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  pending:      { label: 'Pending',      bg: 'rgba(245,158,11,0.12)', color: '#92400E', icon: Clock },
  acknowledged: { label: 'Signed',       bg: 'rgba(52,211,153,0.12)', color: '#047857', icon: CheckCircle2 },
  overdue:      { label: 'Overdue',      bg: 'rgba(217,68,68,0.08)',  color: '#B02020', icon: AlertTriangle },
};

/* ─── Component ─────────────────────────────────────── */
export default function PolicyAckClient({ companyId, isAdmin, documents, acknowledgements, employees }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [docFilter, setDocFilter] = useState<string>('all');

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

    await supabase.from('policy_acknowledgements').upsert(inserts, { onConflict: 'document_id,employee_id' });

    setSaving(false);
    setShowSendForm(false);
    setSelectedDoc(''); setSelectedEmployees([]);
    router.refresh();
  }

  /* ─── Mark as acknowledged (admin on behalf) ─────── */
  async function markAcknowledged(ackId: string) {
    await supabase.from('policy_acknowledgements').update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
    }).eq('id', ackId);
    router.refresh();
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

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>Pending</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#92400E' }}>{pending}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#047857' }}>Signed</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#047857' }}>{signed}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(217,68,68,0.04)', border: '1px solid rgba(217,68,68,0.12)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#B02020' }}>Overdue</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#B02020' }}>{overdue}</p>
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
                      background: docSigned === docTotal ? '#10B981' : 'var(--purple)',
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
                              {ack.acknowledged_at ? ` · Signed ${new Date(ack.acknowledged_at).toLocaleDateString('en-GB')}` : ` · Sent ${new Date(ack.sent_at).toLocaleDateString('en-GB')}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {isAdmin && ack.status === 'pending' && (
                            <button
                              onClick={() => markAcknowledged(ack.id)}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                              style={{ background: 'rgba(52,211,153,0.10)', color: '#047857' }}
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
              <button onClick={() => setShowSendForm(false)} className="btn-icon"><X size={16} /></button>
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
