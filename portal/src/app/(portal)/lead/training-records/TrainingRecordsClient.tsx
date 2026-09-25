'use client';
import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Award, CheckCircle2, Clock, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { parseTrainingCsv, type ParsedTrainingCsv } from '@/lib/lead/parseTrainingCsv';

interface TrainingRecord {
  id: string;
  employee_id: string;
  course_name: string;
  provider: string | null;
  completed_on: string;
  expires_on: string | null;
  notes: string | null;
}

interface Employee { id: string; full_name: string; email: string | null; department: string | null; }

interface Props {
  companyId: string;
  initialRecords: TrainingRecord[];
  employees: Employee[];
}

type Status = 'current' | 'expiring' | 'expired' | 'no_expiry';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; color: string; icon: React.ElementType }> = {
  current:   { label: 'Current',   bg: 'rgba(22,163,74,0.10)',  color: 'var(--success)', icon: CheckCircle2 },
  expiring:  { label: 'Expiring soon', bg: 'rgba(245,158,11,0.10)', color: 'var(--amber)', icon: Clock },
  expired:   { label: 'Expired',   bg: 'rgba(217,68,68,0.10)',  color: 'var(--danger)',  icon: Clock },
  no_expiry: { label: 'No expiry', bg: 'rgba(148,163,184,0.10)', color: 'var(--ink-faint)', icon: Award },
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function statusOf(r: { expires_on: string | null }, today: string): Status {
  if (!r.expires_on) return 'no_expiry';
  if (r.expires_on < today) return 'expired';
  const daysAway = (new Date(r.expires_on).getTime() - new Date(today).getTime()) / 86_400_000;
  return daysAway <= 30 ? 'expiring' : 'current';
}

const EMPTY_FORM = { employee_id: '', course_name: '', provider: '', completed_on: '', expires_on: '', notes: '' };

export default function TrainingRecordsClient({ companyId, initialRecords, employees }: Props) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [records, setRecords] = useState<TrainingRecord[]>(initialRecords);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedTrainingCsv | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const employeeById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const employeeName = (id: string) => employeeById.get(id)?.full_name ?? 'Unknown employee';

  function set(k: keyof typeof EMPTY_FORM, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.employee_id || !form.course_name.trim() || !form.completed_on) return;
    setSaving(true);
    setSaveError('');
    const { data, error } = await supabase.from('training_records').insert({
      company_id: companyId, employee_id: form.employee_id, course_name: form.course_name.trim(),
      provider: form.provider.trim() || null, completed_on: form.completed_on,
      expires_on: form.expires_on || null, notes: form.notes.trim() || null,
    }).select('id, employee_id, course_name, provider, completed_on, expires_on, notes').single();
    setSaving(false);
    if (error || !data) { setSaveError(error?.message ?? 'Could not save.'); return; }
    setRecords(prev => [data as TrainingRecord, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    revalidatePortalPath('/lead/training-records');
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this training record? This cannot be undone.')) return;
    const { error, count } = await supabase.from('training_records').delete({ count: 'exact' }).eq('id', id);
    if (error || !count) { window.alert(error?.message ?? 'Could not delete — you may not have permission.'); return; }
    setRecords(prev => prev.filter(r => r.id !== id));
    revalidatePortalPath('/lead/training-records');
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setParsed(parseTrainingCsv(text, employees));
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!parsed || parsed.matched.length === 0) return;
    setImporting(true);
    const rows = parsed.matched.map(m => ({ company_id: companyId, ...m }));
    const { data, error } = await supabase.from('training_records').insert(rows)
      .select('id, employee_id, course_name, provider, completed_on, expires_on, notes');
    setImporting(false);
    if (error) { window.alert(`Import failed: ${error.message}`); return; }
    setRecords(prev => [...(data as TrainingRecord[]), ...prev]);
    setImportOpen(false);
    setParsed(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    revalidatePortalPath('/lead/training-records');
  }

  const courseNames = useMemo(() => [...new Set(records.map(r => r.course_name))].sort(), [records]);
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, TrainingRecord>>(); // employee_id -> course_name -> latest record
    for (const r of records) {
      if (!m.has(r.employee_id)) m.set(r.employee_id, new Map());
      const forEmp = m.get(r.employee_id)!;
      const existing = forEmp.get(r.course_name);
      if (!existing || r.completed_on > existing.completed_on) forEmp.set(r.course_name, r);
    }
    return m;
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 rounded-[8px] p-1" style={{ background: 'var(--surface-alt)' }}>
          <button onClick={() => setView('list')} className="px-3 py-1 rounded-[6px] text-xs font-semibold" style={view === 'list' ? { background: 'var(--surface)', color: 'var(--ink)' } : { color: 'var(--ink-faint)' }}>List</button>
          <button onClick={() => setView('matrix')} className="px-3 py-1 rounded-[6px] text-xs font-semibold" style={view === 'matrix' ? { background: 'var(--surface)', color: 'var(--ink)' } : { color: 'var(--ink-faint)' }}>Matrix</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImportOpen(v => !v)} className="btn-secondary btn-sm flex items-center gap-1.5">
            <Upload size={13} /> Import CSV
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Add record
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="card p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            CSV columns: <code>employee_email</code> or <code>employee_name</code>, <code>course_name</code>, <code>completed_on</code>,
            and optionally <code>provider</code>, <code>expires_on</code>, <code>notes</code>. Dates as YYYY-MM-DD or DD/MM/YYYY.
          </p>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileSelected} className="text-sm" />
          {parsed && (
            <div className="space-y-2">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {parsed.matched.length} row{parsed.matched.length === 1 ? '' : 's'} ready to import
                {parsed.unmatched.length > 0 && `, ${parsed.unmatched.length} skipped`}
              </p>
              {parsed.unmatched.length > 0 && (
                <ul className="text-xs space-y-0.5" style={{ color: 'var(--danger)' }}>
                  {parsed.unmatched.slice(0, 10).map((u, i) => <li key={i}>Line {u.line}: {u.reason}</li>)}
                  {parsed.unmatched.length > 10 && <li>…and {parsed.unmatched.length - 10} more</li>}
                </ul>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setImportOpen(false); setParsed(null); }} className="btn-secondary btn-sm" disabled={importing}>Cancel</button>
                <button onClick={confirmImport} className="btn-cta btn-sm" disabled={importing || parsed.matched.length === 0}>
                  {importing ? <Loader2 size={13} className="animate-spin" /> : null} Import {parsed.matched.length || ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <select className="input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.department ? ` (${e.department})` : ''}</option>)}
            </select>
            <input className="input" placeholder="Course name" value={form.course_name} onChange={e => set('course_name', e.target.value)} />
            <input className="input" placeholder="Provider (optional)" value={form.provider} onChange={e => set('provider', e.target.value)} />
            <div />
            <div>
              <label className="label">Completed on *</label>
              <input type="date" className="input" value={form.completed_on} onChange={e => set('completed_on', e.target.value)} />
            </div>
            <div>
              <label className="label">Expires on (optional)</label>
              <input type="date" className="input" value={form.expires_on} onChange={e => set('expires_on', e.target.value)} />
            </div>
            <textarea className="input h-16 resize-none sm:col-span-2" placeholder="Notes (optional)" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          {saveError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} className="btn-secondary btn-sm" disabled={saving}>Cancel</button>
            <button onClick={save} className="btn-cta btn-sm" disabled={saving || !form.employee_id || !form.course_name.trim() || !form.completed_on}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Save
            </button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <Award size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No training records yet</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>Add one, or import your existing training history as a CSV.</p>
          </div>
        </div>
      ) : view === 'list' ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Course</th><th>Provider</th><th>Completed</th><th>Expires</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {records.map(r => {
                const st = STATUS_CONFIG[statusOf(r, today)];
                const Icon = st.icon;
                return (
                  <tr key={r.id}>
                    <td>{employeeName(r.employee_id)}</td>
                    <td>{r.course_name}</td>
                    <td>{r.provider ?? '—'}</td>
                    <td>{fmt(r.completed_on)}</td>
                    <td>{fmt(r.expires_on)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: st.bg, color: st.color }}>
                        <Icon size={11} /> {st.label}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => remove(r.id)} className="btn-icon btn-sm" style={{ color: 'var(--ink-faint)' }} aria-label="Delete">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Employee</th>{courseNames.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {[...matrix.keys()].sort((a, b) => employeeName(a).localeCompare(employeeName(b))).map(empId => (
                <tr key={empId}>
                  <td>{employeeName(empId)}</td>
                  {courseNames.map(c => {
                    const r = matrix.get(empId)?.get(c);
                    if (!r) return <td key={c} style={{ color: 'var(--ink-faint)' }}>—</td>;
                    const st = STATUS_CONFIG[statusOf(r, today)];
                    return (
                      <td key={c}>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: st.bg, color: st.color }}>
                          {fmt(r.completed_on)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
