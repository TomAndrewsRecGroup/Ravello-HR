'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, Calendar } from 'lucide-react';

interface AbsenceRecord {
  id: string;
  employee_name: string;
  employee_email: string | null;
  department: string | null;
  absence_type: string;
  start_date: string;
  end_date: string | null;
  days: number | null;
  status: string;
  notes: string | null;
  approved_by: string | null;
  created_at: string;
}

interface Props { companyId: string; initialRecords: AbsenceRecord[]; }

const ABSENCE_TYPES = ['holiday', 'sick', 'maternity', 'paternity', 'shared_parental', 'compassionate', 'unpaid', 'other'];
const ABSENCE_LABELS: Record<string, string> = {
  holiday: 'Holiday', sick: 'Sick Leave', maternity: 'Maternity',
  paternity: 'Paternity', shared_parental: 'Shared Parental',
  compassionate: 'Compassionate', unpaid: 'Unpaid', other: 'Other',
};
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: 'rgba(148,163,184,0.12)', color: '#475569' },
  approved:  { label: 'Approved',  bg: 'rgba(22,163,74,0.12)',   color: '#166534' },
  rejected:  { label: 'Rejected',  bg: 'rgba(220,38,38,0.10)',   color: '#991B1B' },
  cancelled: { label: 'Cancelled', bg: 'rgba(148,163,184,0.12)', color: '#475569' },
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AbsenceClient({ companyId, initialRecords }: Props) {
  const supabase = createClient();
  const [records, setRecords] = useState<AbsenceRecord[]>(initialRecords);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({
    employee_name: '', employee_email: '', department: '',
    absence_type: 'holiday', start_date: '', end_date: '',
    days: '', notes: '', approved_by: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.employee_name.trim() || !form.start_date) return;
    setSaving(true);
    const { data } = await supabase.from('absence_records').insert({
      company_id:     companyId,
      employee_name:  form.employee_name,
      employee_email: form.employee_email || null,
      department:     form.department || null,
      absence_type:   form.absence_type,
      start_date:     form.start_date,
      end_date:       form.end_date || null,
      days:           form.days ? parseFloat(form.days) : null,
      notes:          form.notes || null,
      approved_by:    form.approved_by || null,
      status:         'pending',
    }).select().single();
    if (data) setRecords(prev => [data as AbsenceRecord, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ employee_name: '', employee_email: '', department: '', absence_type: 'holiday', start_date: '', end_date: '', days: '', notes: '', approved_by: '' });
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('absence_records').update({ status }).eq('id', id);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  const filtered = records.filter(r =>
    (filterType === 'all' || r.absence_type === filterType) &&
    (filterStatus === 'all' || r.status === filterStatus)
  );

  // Stats
  const totalDays = records.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.days ?? 0), 0);
  const pendingCount = records.filter(r => r.status === 'pending').length;
  const sickDays = records.filter(r => r.absence_type === 'sick' && r.status === 'approved').reduce((sum, r) => sum + (r.days ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--purple)' }}>{totalDays}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Approved Days</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: pendingCount > 0 ? '#D97706' : 'var(--ink)' }}>{pendingCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Pending Approval</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: sickDays > 10 ? '#DC2626' : 'var(--ink)' }}>{sickDays}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Sick Days (approved)</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs py-1.5 w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {ABSENCE_TYPES.map(t => <option key={t} value={t}>{ABSENCE_LABELS[t]}</option>)}
          </select>
          <select className="input text-xs py-1.5 w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Log Absence
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Log Absence</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Name *</label>
              <input className="input" placeholder="e.g. James Smith" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Sales" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="label">Absence Type</label>
              <select className="input" value={form.absence_type} onChange={e => set('absence_type', e.target.value)}>
                {ABSENCE_TYPES.map(t => <option key={t} value={t}>{ABSENCE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Days</label>
              <input type="number" step="0.5" className="input" placeholder="e.g. 5" value={form.days} onChange={e => set('days', e.target.value)} />
            </div>
            <div>
              <label className="label">Start Date *</label>
              <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Approved By</label>
              <input className="input" placeholder="e.g. Line Manager" value={form.approved_by} onChange={e => set('approved_by', e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" placeholder="Optional notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.employee_name.trim() || !form.start_date} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state py-4">
            <Calendar size={24} />
            <p className="text-sm">No absence records yet</p>
            <p className="text-xs max-w-[280px]">Log holiday, sickness and other leave to track team absence.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {['Employee', 'Type', 'Start', 'End', 'Days', 'Status', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.employee_name}</p>
                      {r.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>}
                    </td>
                    <td className="text-sm">{ABSENCE_LABELS[r.absence_type] ?? r.absence_type}</td>
                    <td className="text-sm">{fmtDate(r.start_date)}</td>
                    <td className="text-sm">{fmtDate(r.end_date)}</td>
                    <td className="text-sm">{r.days ?? '—'}</td>
                    <td>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td>
                      {r.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(r.id, 'approved')} className="btn-sm" style={{ background: 'rgba(22,163,74,0.1)', color: '#166534', border: 'none', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                            Approve
                          </button>
                          <button onClick={() => updateStatus(r.id, 'rejected')} className="btn-sm" style={{ background: 'rgba(220,38,38,0.08)', color: '#991B1B', border: 'none', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
