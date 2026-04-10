'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import { Plus, X, Loader2, AlertTriangle, CheckCircle2, Clock, BookOpen } from 'lucide-react';

interface TrainingNeed {
  id: string;
  employee_name: string | null;
  department: string | null;
  skill_gap: string;
  priority: string;
  status: string;
  notes: string | null;
  target_date: string | null;
  created_at: string;
}

interface Props {
  companyId: string;
  userId: string;
  initialNeeds: TrainingNeed[];
}

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  low:      { label: 'Low',      bg: 'rgba(148,163,184,0.12)', color: '#475569' },
  medium:   { label: 'Medium',   bg: 'rgba(59,111,255,0.12)',  color: '#1848CC' },
  high:     { label: 'High',     bg: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  critical: { label: 'Critical', bg: 'rgba(220,38,38,0.10)',   color: '#991B1B' },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  open:        { label: 'Open',        icon: AlertTriangle },
  in_progress: { label: 'In Progress', icon: Clock },
  resolved:    { label: 'Resolved',    icon: CheckCircle2 },
  deferred:    { label: 'Deferred',    icon: Clock },
};

const STATUSES = ['open', 'in_progress', 'resolved', 'deferred'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TrainingNeedsClient({ companyId, userId, initialNeeds }: Props) {
  const supabase = createClient();
  const [needs, setNeeds] = useState<TrainingNeed[]>(initialNeeds);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [form, setForm] = useState({
    employee_name: '', department: '', skill_gap: '',
    priority: 'medium', notes: '', target_date: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.skill_gap.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('training_needs').insert({
      company_id:    companyId,
      flagged_by:    userId,
      employee_name: form.employee_name || null,
      department:    form.department || null,
      skill_gap:     form.skill_gap,
      priority:      form.priority,
      notes:         form.notes || null,
      target_date:   form.target_date || null,
      status:        'open',
    }).select().single();
    if (!error && data) {
      setNeeds(prev => [data as TrainingNeed, ...prev]);
      setShowForm(false);
      setForm({ employee_name: '', department: '', skill_gap: '', priority: 'medium', notes: '', target_date: '' });
      revalidatePortalPath('/lead/training');
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('training_needs').update({ status }).eq('id', id);
    if (!error) {
      setNeeds(prev => prev.map(n => n.id === id ? { ...n, status } : n));
      revalidatePortalPath('/lead/training');
    }
  }

  const filtered = filter === 'all' ? needs : needs.filter(n => n.status === filter);

  const counts = {
    open:        needs.filter(n => n.status === 'open').length,
    in_progress: needs.filter(n => n.status === 'in_progress').length,
    resolved:    needs.filter(n => n.status === 'resolved').length,
  };

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Open',        value: counts.open,        color: '#DC2626' },
          { label: 'In Progress', value: counts.in_progress, color: '#D97706' },
          { label: 'Resolved',    value: counts.resolved,    color: '#16A34A' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {['all', 'open', 'in_progress', 'resolved', 'deferred'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`btn-sm ${filter === s ? 'btn-cta' : 'btn-secondary'}`}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Flag Need
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>New Training Need</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Name</label>
              <input className="input" placeholder="e.g. Sarah Jones" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Sales" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Skill Gap *</label>
              <input className="input" placeholder="Describe the skill gap or development need" value={form.skill_gap} onChange={e => set('skill_gap', e.target.value)} />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Target Date</label>
              <input type="date" className="input" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-16 resize-none" placeholder="Context, suggested solutions, etc." value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.skill_gap.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state py-4">
            <BookOpen size={24} />
            <p className="text-sm">No training needs {filter !== 'all' ? `with status "${filter}"` : 'yet'}</p>
            <p className="text-xs max-w-[280px]">Flag skill gaps and development needs for your team. Your consultant at The People Office will help build L&D plans.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => {
            const pc = PRIORITY_CONFIG[n.priority] ?? PRIORITY_CONFIG.medium;
            const sc = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.open;
            const StatusIcon = sc.icon;
            return (
              <div key={n.id} className="card p-5" style={{ borderLeft: `3px solid ${pc.color}` }}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{n.skill_gap}</p>
                    {(n.employee_name || n.department) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                        {[n.employee_name, n.department].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: pc.bg, color: pc.color }}>
                      {pc.label}
                    </span>
                  </div>
                </div>
                {n.notes && (
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{n.notes}</p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <StatusIcon size={12} />
                    <span>{sc.label}</span>
                    {n.target_date && <span>· Target: {fmtDate(n.target_date)}</span>}
                  </div>
                  {n.status !== 'resolved' && (
                    <select
                      className="input text-xs py-1 w-auto"
                      value={n.status}
                      onChange={e => updateStatus(n.id, e.target.value)}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
