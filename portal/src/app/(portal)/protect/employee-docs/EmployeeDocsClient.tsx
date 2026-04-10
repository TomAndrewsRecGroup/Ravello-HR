'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Plus, X, Loader2, FileText, AlertTriangle, ExternalLink } from 'lucide-react';

interface EmpDoc {
  id: string;
  employee_name: string;
  employee_email: string | null;
  department: string | null;
  doc_type: string;
  title: string;
  file_url: string | null;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface Props { companyId: string; userId: string; initialDocs: EmpDoc[]; }

const DOC_TYPES = [
  'contract', 'right_to_work', 'dbs_check', 'visa', 'offer_letter',
  'nda', 'disciplinary', 'grievance', 'absence_record', 'other',
];
const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Contract', right_to_work: 'Right to Work', dbs_check: 'DBS Check',
  visa: 'Visa', offer_letter: 'Offer Letter', nda: 'NDA',
  disciplinary: 'Disciplinary', grievance: 'Grievance',
  absence_record: 'Absence Record', other: 'Other',
};
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  active:           { label: 'Active',           bg: 'rgba(22,163,74,0.12)',   color: '#166534' },
  expired:          { label: 'Expired',          bg: 'rgba(220,38,38,0.10)',   color: '#991B1B' },
  pending_renewal:  { label: 'Pending Renewal',  bg: 'rgba(245,158,11,0.12)', color: '#92400E' },
  archived:         { label: 'Archived',         bg: 'rgba(148,163,184,0.12)', color: '#475569' },
};

function daysUntilExpiry(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EmployeeDocsClient({ companyId, userId, initialDocs }: Props) {
  const supabase = createClient();
  const [docs, setDocs] = useState<EmpDoc[]>(initialDocs);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [form, setForm] = useState({
    employee_name: '', employee_email: '', department: '',
    doc_type: 'contract', title: '', file_url: '',
    expiry_date: '', notes: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.employee_name.trim() || !form.title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('employee_documents').insert({
      company_id:     companyId,
      uploaded_by:    userId,
      employee_name:  form.employee_name,
      employee_email: form.employee_email || null,
      department:     form.department || null,
      doc_type:       form.doc_type,
      title:          form.title,
      file_url:       form.file_url || null,
      expiry_date:    form.expiry_date || null,
      notes:          form.notes || null,
      status:         'active',
    }).select().single();
    if (!error && data) {
      setDocs(prev => [...prev, data as EmpDoc].sort((a, b) => a.employee_name.localeCompare(b.employee_name)));
      setShowForm(false);
      setForm({ employee_name: '', employee_email: '', department: '', doc_type: 'contract', title: '', file_url: '', expiry_date: '', notes: '' });
      revalidatePortalPath('/protect/employee-docs');
    }
    setSaving(false);
  }

  const employees = useMemo(() => ['all', ...Array.from(new Set(docs.map(d => d.employee_name)))], [docs]);

  const filtered = docs.filter(d =>
    (filterType === 'all' || d.doc_type === filterType) &&
    (filterEmployee === 'all' || d.employee_name === filterEmployee)
  );

  // Expiry alerts
  const expiringWithin30 = docs.filter(d => {
    const days = daysUntilExpiry(d.expiry_date);
    return days !== null && days >= 0 && days <= 30 && d.status === 'active';
  });
  const expired = docs.filter(d => {
    const days = daysUntilExpiry(d.expiry_date);
    return days !== null && days < 0 && d.status !== 'archived';
  });

  return (
    <div className="space-y-5">
      {/* Alerts */}
      {(expired.length > 0 || expiringWithin30.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="card p-4 flex items-start gap-3" style={{ borderLeft: '3px solid #DC2626', background: 'rgba(220,38,38,0.03)' }}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{expired.length} expired document{expired.length > 1 ? 's' : ''}</p>
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{expired.map(d => `${d.employee_name} – ${DOC_TYPE_LABELS[d.doc_type]}`).join(', ')}</p>
              </div>
            </div>
          )}
          {expiringWithin30.length > 0 && (
            <div className="card p-4 flex items-start gap-3" style={{ borderLeft: '3px solid #D97706', background: 'rgba(217,119,6,0.03)' }}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{expiringWithin30.length} document{expiringWithin30.length > 1 ? 's' : ''} expiring within 30 days</p>
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{expiringWithin30.map(d => `${d.employee_name} – ${DOC_TYPE_LABELS[d.doc_type]}`).join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{docs.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Total Documents</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#DC2626' }}>{expired.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Expired</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#D97706' }}>{expiringWithin30.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Expiring Soon</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs py-1.5 w-auto" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
            {employees.map(e => <option key={e} value={e}>{e === 'all' ? 'All Employees' : e}</option>)}
          </select>
          <select className="input text-xs py-1.5 w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Document
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Add Employee Document</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Name *</label>
              <input className="input" placeholder="e.g. Sarah Jones" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Employee Email</label>
              <input type="email" className="input" placeholder="sarah@company.com" value={form.employee_email} onChange={e => set('employee_email', e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Sales" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="label">Document Type</label>
              <select className="input" value={form.doc_type} onChange={e => set('doc_type', e.target.value)}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Document Title *</label>
              <input className="input" placeholder="e.g. Employment Contract – Sarah Jones" value={form.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">File URL</label>
              <input className="input" placeholder="https://drive.google.com/..." value={form.file_url} onChange={e => set('file_url', e.target.value)} />
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input type="date" className="input" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" placeholder="Optional notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.employee_name.trim() || !form.title.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
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
            <FileText size={24} />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs max-w-[280px]">Add employee documents to track contracts, right to work, DBS checks and more.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {['Employee', 'Type', 'Title', 'Expiry', 'Status', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const sc = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.active;
                const days = daysUntilExpiry(d.expiry_date);
                const isExpired = days !== null && days < 0;
                const isExpiringSoon = days !== null && days >= 0 && days <= 30;
                return (
                  <tr key={d.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{d.employee_name}</p>
                      {d.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{d.department}</p>}
                    </td>
                    <td className="text-sm">{DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}</td>
                    <td className="text-sm max-w-[200px] truncate">{d.title}</td>
                    <td>
                      {d.expiry_date ? (
                        <span className="text-sm" style={{ color: isExpired ? '#DC2626' : isExpiringSoon ? '#D97706' : 'var(--ink-soft)' }}>
                          {fmtDate(d.expiry_date)}
                          {isExpired && ' (expired)'}
                          {isExpiringSoon && !isExpired && ` (${days}d)`}
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm flex items-center gap-1">
                          <ExternalLink size={12} /> View
                        </a>
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
