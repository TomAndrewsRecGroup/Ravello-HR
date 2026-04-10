'use client';
import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import {
  Plus, X, Loader2, CheckCircle2, Clock, Circle,
  AlertTriangle, Filter, Building2,
} from 'lucide-react';

interface Task {
  id: string; title: string; description: string | null;
  priority: string; status: string; due_date: string | null;
  company_id: string | null; assigned_to: string | null;
  completed_at: string | null; created_at: string;
  profiles?: { full_name: string } | null;
  companies?: { name: string } | null;
}
interface Staff { id: string; full_name: string; role: string; }
interface Company { id: string; name: string; }

interface Props {
  userId: string; tasks: Task[]; staff: Staff[]; companies: Company[];
}

const PRIORITY: Record<string, { label: string; bg: string; color: string }> = {
  low:    { label: 'Low',    bg: 'rgba(148,163,184,0.10)', color: '#475569' },
  normal: { label: 'Normal', bg: 'rgba(59,111,255,0.10)',  color: '#1848CC' },
  high:   { label: 'High',   bg: 'rgba(245,158,11,0.12)',  color: '#92400E' },
  urgent: { label: 'Urgent', bg: 'rgba(217,68,68,0.08)',   color: '#B02020' },
};

const STATUS_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  todo:        { icon: Circle,        color: 'var(--ink-faint)' },
  in_progress: { icon: Clock,         color: 'var(--purple)' },
  done:        { icon: CheckCircle2,  color: '#10B981' },
};

const COLUMNS = [
  { key: 'todo',        label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done',        label: 'Done' },
];

export default function TaskBoardClient({ userId, tasks: initialTasks, staff, companies }: Props) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterAssigned, setFilterAssigned] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');

  const [form, setForm] = useState({
    title: '', description: '', priority: 'normal', assigned_to: '',
    company_id: '', due_date: '',
  });

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterAssigned !== 'all' && t.assigned_to !== filterAssigned) return false;
      if (filterCompany !== 'all' && t.company_id !== filterCompany) return false;
      return true;
    });
  }, [tasks, filterAssigned, filterCompany]);

  const todoCount = filtered.filter(t => t.status === 'todo').length;
  const inProgressCount = filtered.filter(t => t.status === 'in_progress').length;
  const doneCount = filtered.filter(t => t.status === 'done').length;

  async function createTask() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('internal_tasks').insert({
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      company_id: form.company_id || null,
      due_date: form.due_date || null,
      created_by: userId,
    }).select('*, profiles!internal_tasks_assigned_to_fkey(full_name), companies(name)').single();
    if (data) setTasks(prev => [data as Task, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ title: '', description: '', priority: 'normal', assigned_to: '', company_id: '', due_date: '' });
    revalidateAdminPath('/tasks');
  }

  async function moveTask(taskId: string, newStatus: string) {
    const completed = newStatus === 'done' ? new Date().toISOString() : null;
    const { error } = await supabase.from('internal_tasks').update({ status: newStatus, completed_at: completed }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, completed_at: completed } : t));
      revalidateAdminPath('/tasks');
    }
  }

  async function deleteTask(taskId: string) {
    const { error } = await supabase.from('internal_tasks').delete().eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      revalidateAdminPath('/tasks');
    }
  }

  function isOverdue(due: string | null): boolean {
    if (!due) return false;
    return new Date(due) < new Date(new Date().toISOString().split('T')[0]);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
            {todoCount} to do · {inProgressCount} in progress · {doneCount} done
          </span>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-cta btn-sm">
          <Plus size={13} /> New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select className="input w-auto" style={{ minWidth: 150 }} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
          <option value="all">All team</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <select className="input w-auto" style={{ minWidth: 150 }} value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="all">All clients</option>
          <option value="">General (no client)</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Kanban columns */}
      <div className="grid lg:grid-cols-3 gap-4">
        {COLUMNS.map(col => {
          const colTasks = filtered.filter(t => t.status === col.key);
          const st = STATUS_ICON[col.key];
          const Icon = st.icon;

          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Icon size={14} style={{ color: st.color }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
                  {col.label} ({colTasks.length})
                </p>
              </div>

              <div className="space-y-2 min-h-[100px]">
                {colTasks.map(task => {
                  const p = PRIORITY[task.priority] ?? PRIORITY.normal;
                  const overdue = col.key !== 'done' && isOverdue(task.due_date);

                  return (
                    <div
                      key={task.id}
                      className="card p-3 group"
                      style={overdue ? { borderLeft: '3px solid #DC2626' } : undefined}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium leading-snug" style={{ color: col.key === 'done' ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: col.key === 'done' ? 'line-through' : 'none' }}>
                          {task.title}
                        </p>
                        <button onClick={() => deleteTask(task.id)} className="btn-icon opacity-0 group-hover:opacity-100" style={{ width: 20, height: 20 }}>
                          <X size={10} />
                        </button>
                      </div>

                      {task.description && (
                        <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{task.description}</p>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: p.bg, color: p.color }}>{p.label}</span>
                        {task.companies && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)' }}>
                            <Building2 size={8} /> {(task.companies as any).name}
                          </span>
                        )}
                        {task.profiles && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
                            {(task.profiles as any).full_name}
                          </span>
                        )}
                        {task.due_date && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: overdue ? 'rgba(217,68,68,0.08)' : 'var(--surface-soft)', color: overdue ? '#DC2626' : 'var(--ink-faint)' }}>
                            {overdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>

                      {/* Move buttons */}
                      {col.key !== 'done' && (
                        <div className="flex gap-1.5">
                          {col.key === 'todo' && (
                            <button onClick={() => moveTask(task.id, 'in_progress')} className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)' }}>
                              Start →
                            </button>
                          )}
                          {col.key === 'in_progress' && (
                            <>
                              <button onClick={() => moveTask(task.id, 'todo')} className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ color: 'var(--ink-faint)' }}>
                                ← Back
                              </button>
                              <button onClick={() => moveTask(task.id, 'done')} className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.10)', color: '#047857' }}>
                                Done ✓
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="rounded-lg py-6 text-center" style={{ border: '1px dashed var(--line)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>No tasks</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New task modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative card p-6 w-full max-w-md" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>New Task</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Task *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Review Company X handbook" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Assign To</label>
                  <select className="input" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Client</label>
                  <select className="input" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}>
                    <option value="">General</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={createTask} disabled={saving || !form.title.trim()} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
