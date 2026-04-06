'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Loader2, CheckCircle2, UserMinus,
  ChevronDown, ChevronRight, Clipboard, Play, Trash2, FileText,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface TemplateTask {
  id: string; title: string; description: string | null;
  category: string; due_day_offset: number; sort_order: number;
}
interface Template {
  id: string; name: string; description: string | null;
  offboarding_template_tasks: TemplateTask[];
}
interface TaskProgress {
  id: string; task_title: string; task_description: string | null;
  category: string; due_date: string | null; status: string;
  completed_at: string | null; notes: string | null; sort_order: number;
}
interface Instance {
  id: string; employee_id: string; template_id: string | null;
  last_working_day: string | null; reason: string | null;
  exit_interview_notes: string | null;
  status: string; started_at: string; completed_at: string | null;
  employee_records: { full_name: string; job_title: string } | null;
  offboarding_task_progress: TaskProgress[];
}
interface Employee { id: string; full_name: string; job_title: string; }

interface Props {
  companyId: string; userId: string; isAdmin: boolean;
  templates: Template[]; instances: Instance[]; employees: Employee[];
}

const CATEGORIES = [
  { key: 'general', label: 'General', color: '#3B6FFF' },
  { key: 'it_access', label: 'IT & Access', color: '#7C3AED' },
  { key: 'asset_return', label: 'Asset Return', color: '#D97706' },
  { key: 'knowledge_transfer', label: 'Knowledge Transfer', color: '#14B8A6' },
  { key: 'exit_admin', label: 'Exit Admin', color: '#EA3DC4' },
];

const REASONS = [
  { key: 'resignation', label: 'Resignation' },
  { key: 'redundancy', label: 'Redundancy' },
  { key: 'dismissal', label: 'Dismissal' },
  { key: 'end_of_contract', label: 'End of Contract' },
  { key: 'retirement', label: 'Retirement' },
  { key: 'other', label: 'Other' },
];

function catColor(cat: string) {
  return CATEGORIES.find(c => c.key === cat)?.color ?? 'var(--ink-faint)';
}

/* ─── Component ─────────────────────────────────────── */
export default function OffboardingClient({ companyId, userId, isAdmin, templates, instances, employees }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<'active' | 'templates'>('active');
  const [saving, setSaving] = useState(false);

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateTasks, setTemplateTasks] = useState<{ title: string; category: string; due_day_offset: number }[]>([]);

  // Start offboarding form
  const [showStartForm, setShowStartForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [reason, setReason] = useState('resignation');

  // Expand + exit interview
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [exitNotes, setExitNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const activeInstances = instances.filter(i => i.status === 'in_progress');
  const completedInstances = instances.filter(i => i.status === 'completed');

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setSaving(true);
    const { data: tmpl } = await supabase
      .from('offboarding_templates')
      .insert({ company_id: companyId, name: templateName.trim(), description: templateDesc || null })
      .select().single();
    if (tmpl && templateTasks.length > 0) {
      await supabase.from('offboarding_template_tasks').insert(
        templateTasks.map((t, i) => ({
          template_id: tmpl.id, title: t.title, category: t.category,
          due_day_offset: t.due_day_offset, sort_order: i,
        }))
      );
    }
    setSaving(false);
    setShowTemplateForm(false);
    setTemplateName(''); setTemplateDesc(''); setTemplateTasks([]);
    router.refresh();
  }

  async function startOffboarding() {
    if (!selectedEmployee || !selectedTemplate || !lastWorkingDay) return;
    setSaving(true);
    const template = templates.find(t => t.id === selectedTemplate);

    const { data: inst } = await supabase
      .from('offboarding_instances')
      .insert({
        company_id: companyId, employee_id: selectedEmployee,
        template_id: selectedTemplate, last_working_day: lastWorkingDay,
        reason,
      })
      .select().single();

    if (inst && template) {
      const lwd = new Date(lastWorkingDay);
      await supabase.from('offboarding_task_progress').insert(
        template.offboarding_template_tasks
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t, i) => {
            const due = new Date(lwd);
            due.setDate(due.getDate() + t.due_day_offset);
            return {
              instance_id: inst.id, task_title: t.title,
              task_description: t.description ?? null,
              category: t.category, due_date: due.toISOString().split('T')[0],
              sort_order: i,
            };
          })
      );
    }

    // Update employee status to terminated
    await supabase
      .from('employee_records')
      .update({ status: 'terminated', end_date: lastWorkingDay })
      .eq('id', selectedEmployee);

    setSaving(false);
    setShowStartForm(false);
    setSelectedEmployee(''); setSelectedTemplate(''); setLastWorkingDay(''); setReason('resignation');
    router.refresh();
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await supabase.from('offboarding_task_progress').update({
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      completed_by: newStatus === 'completed' ? userId : null,
    }).eq('id', taskId);
    router.refresh();
  }

  async function completeInstance(instanceId: string) {
    await supabase.from('offboarding_instances').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', instanceId);
    router.refresh();
  }

  async function saveExitNotes(instanceId: string) {
    setSavingNotes(true);
    await supabase.from('offboarding_instances').update({
      exit_interview_notes: exitNotes,
    }).eq('id', instanceId);
    setSavingNotes(false);
    router.refresh();
  }

  function addTask() {
    setTemplateTasks(prev => [...prev, { title: '', category: 'general', due_day_offset: 0 }]);
  }
  function removeTask(idx: number) {
    setTemplateTasks(prev => prev.filter((_, i) => i !== idx));
  }
  function updateTask(idx: number, field: string, val: string | number) {
    setTemplateTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Offboarding</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            {activeInstances.length} active · {completedInstances.length} completed
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTemplateForm(true)} className="btn-secondary btn-sm">
              <Clipboard size={13} /> New Template
            </button>
            <button onClick={() => setShowStartForm(true)} className="btn-cta btn-sm" disabled={templates.length === 0}>
              <UserMinus size={13} /> Start Offboarding
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid var(--line)' }}>
        {[{ key: 'active', label: `Active (${activeInstances.length})` }, { key: 'templates', label: `Templates (${templates.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ color: tab === t.key ? 'var(--purple)' : 'var(--ink-faint)', borderBottom: tab === t.key ? '2px solid var(--purple)' : '2px solid transparent', marginBottom: '-1px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Active Offboardings ───────────────────────── */}
      {tab === 'active' && (
        <div>
          {activeInstances.length === 0 ? (
            <div className="empty-state">
              <UserMinus size={28} />
              <p className="text-sm font-medium">No active offboardings</p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {templates.length === 0 ? 'Create a template first.' : 'Click "Start Offboarding" when needed.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeInstances.map(inst => {
                const emp = inst.employee_records;
                const tasks = inst.offboarding_task_progress.sort((a, b) => a.sort_order - b.sort_order);
                const done = tasks.filter(t => t.status === 'completed').length;
                const total = tasks.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const isExpanded = expandedInstance === inst.id;

                return (
                  <div key={inst.id} className="card">
                    <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => {
                      setExpandedInstance(isExpanded ? null : inst.id);
                      if (!isExpanded) setExitNotes(inst.exit_interview_notes ?? '');
                    }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(217,68,68,0.08)' }}>
                        <UserMinus size={16} style={{ color: '#B02020' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{emp?.full_name ?? 'Employee'}</p>
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          {emp?.job_title}
                          {inst.reason ? ` · ${inst.reason.replace(/_/g, ' ')}` : ''}
                          {inst.last_working_day ? ` · Last day: ${new Date(inst.last_working_day).toLocaleDateString('en-GB')}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="hidden sm:block text-right">
                          <p className="text-sm font-bold" style={{ color: pct === 100 ? '#047857' : '#B02020' }}>{pct}%</p>
                          <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{done}/{total}</p>
                        </div>
                        <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10B981' : '#D94444' }} />
                        </div>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
                        {/* Tasks */}
                        <div className="space-y-1.5 mt-3">
                          {tasks.map(task => (
                            <div key={task.id} className="flex items-start gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[var(--surface-soft)]">
                              <button onClick={() => toggleTask(task.id, task.status)} className="mt-0.5 flex-shrink-0">
                                {task.status === 'completed'
                                  ? <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                                  : <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: 'var(--line)' }} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm" style={{ color: task.status === 'completed' ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                                  {task.task_title}
                                </p>
                              </div>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${catColor(task.category)}15`, color: catColor(task.category) }}>
                                {task.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Exit Interview Notes */}
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <FileText size={13} style={{ color: 'var(--ink-faint)' }} />
                            <label className="label mb-0">Exit Interview Notes</label>
                          </div>
                          <textarea
                            className="input"
                            rows={3}
                            value={exitNotes}
                            onChange={e => setExitNotes(e.target.value)}
                            placeholder="Record exit interview feedback, reasons for leaving, suggestions..."
                          />
                          <button
                            onClick={() => saveExitNotes(inst.id)}
                            disabled={savingNotes}
                            className="btn-secondary btn-sm mt-2"
                          >
                            {savingNotes ? <Loader2 size={12} className="animate-spin" /> : null} Save Notes
                          </button>
                        </div>

                        {pct === 100 && isAdmin && (
                          <button onClick={() => completeInstance(inst.id)} className="btn-cta btn-sm mt-4">
                            <CheckCircle2 size={13} /> Mark Offboarding Complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Templates ─────────────────────────────────── */}
      {tab === 'templates' && (
        <div>
          {templates.length === 0 ? (
            <div className="empty-state">
              <Clipboard size={28} />
              <p className="text-sm font-medium">No offboarding templates</p>
              {isAdmin && (
                <button onClick={() => setShowTemplateForm(true)} className="btn-cta btn-sm mt-3">
                  <Plus size={13} /> Create Template
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{tmpl.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
                      {tmpl.offboarding_template_tasks.length} tasks
                    </span>
                  </div>
                  <div className="space-y-1">
                    {tmpl.offboarding_template_tasks.sort((a, b) => a.sort_order - b.sort_order).map(task => (
                      <div key={task.id} className="flex items-center gap-2 text-xs py-1">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: catColor(task.category) }} />
                        <span style={{ color: 'var(--ink)' }}>{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Template Modal ────────────────────────────── */}
      {showTemplateForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowTemplateForm(false)} />
          <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl" style={{ animation: 'slideInRight 0.3s ease' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>New Offboarding Template</h3>
              <button onClick={() => setShowTemplateForm(false)} className="btn-icon"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="form-group">
                <label className="label">Template Name *</label>
                <input className="input" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Standard Leaver" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <input className="input" value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="label mb-0">Checklist Tasks</label>
                  <button onClick={addTask} className="btn-secondary btn-sm"><Plus size={12} /> Add</button>
                </div>
                <div className="space-y-3">
                  {templateTasks.map((task, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--line)' }}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <input className="input" placeholder="Task title *" value={task.title} onChange={e => updateTask(i, 'title', e.target.value)} />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select className="input" value={task.category} onChange={e => updateTask(i, 'category', e.target.value)}>
                              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--ink-faint)' }}>Day</span>
                              <input className="input" type="number" value={task.due_day_offset} onChange={e => updateTask(i, 'due_day_offset', parseInt(e.target.value) || 0)} />
                            </div>
                          </div>
                        </div>
                        <button onClick={() => removeTask(i)} className="btn-icon mt-1"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 z-10 flex justify-end gap-3 px-6 py-4 bg-white" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setShowTemplateForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={saveTemplate} disabled={saving || !templateName.trim()} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start Offboarding Modal ───────────────────── */}
      {showStartForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStartForm(false)} />
          <div className="relative card p-6 w-full max-w-md overflow-y-auto max-h-[calc(100vh-80px)]" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Start Offboarding</h3>
              <button onClick={() => setShowStartForm(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Employee *</label>
                <select className="input" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                  <option value="">Select...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.job_title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Template *</label>
                <select className="input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  <option value="">Select...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Last Working Day *</label>
                <input className="input" type="date" value={lastWorkingDay} onChange={e => setLastWorkingDay(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label">Reason</label>
                <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowStartForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={startOffboarding} disabled={saving || !selectedEmployee || !selectedTemplate || !lastWorkingDay} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Start
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
