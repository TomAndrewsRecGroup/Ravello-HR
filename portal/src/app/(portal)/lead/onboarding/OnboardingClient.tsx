'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { revalidatePortalPath } from '@/app/actions';
import {
  Plus, X, Loader2, CheckCircle2, Clock, UserPlus,
  ChevronDown, ChevronRight, Clipboard, Play, Trash2,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */
interface TemplateTask {
  id: string; title: string; description: string | null;
  category: string; due_day_offset: number; assigned_to: string | null; sort_order: number;
}
interface Template {
  id: string; name: string; description: string | null; is_default: boolean;
  onboarding_template_tasks: TemplateTask[];
}
interface TaskProgress {
  id: string; task_title: string; task_description: string | null;
  category: string; due_date: string | null; status: string;
  completed_at: string | null; notes: string | null; sort_order: number;
}
interface Instance {
  id: string; employee_id: string; template_id: string | null;
  status: string; started_at: string; completed_at: string | null;
  employee_records: { full_name: string; job_title: string; start_date: string } | null;
  onboarding_task_progress: TaskProgress[];
}
interface Employee { id: string; full_name: string; job_title: string; start_date: string; }

interface Props {
  companyId: string; userId: string; isAdmin: boolean;
  templates: Template[]; instances: Instance[]; employees: Employee[];
}

const CATEGORIES = [
  { key: 'general', label: 'General', color: 'var(--blue)' },
  { key: 'it_setup', label: 'IT Setup', color: 'var(--purple)' },
  { key: 'documents', label: 'Documents', color: 'var(--teal)' },
  { key: 'training', label: 'Training', color: 'var(--amber)' },
  { key: 'intro', label: 'Introductions', color: '#EA3DC4' },
];

function catColor(cat: string) {
  return CATEGORIES.find(c => c.key === cat)?.color ?? 'var(--ink-faint)';
}

/* ─── Component ─────────────────────────────────────── */
export default function OnboardingClient({ companyId, userId, isAdmin, templates, instances, employees }: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<'active' | 'templates'>('active');
  const [saving, setSaving] = useState(false);

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateTasks, setTemplateTasks] = useState<{ title: string; category: string; due_day_offset: number; description: string }[]>([]);

  // Start onboarding form
  const [showStartForm, setShowStartForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // Expand instance
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);

  const activeInstances = instances.filter(i => i.status === 'in_progress');
  const completedInstances = instances.filter(i => i.status === 'completed');

  /* ─── Create template ────────────────────────────── */
  async function saveTemplate() {
    if (!templateName.trim()) return;
    setSaving(true);
    const { data: tmpl } = await supabase
      .from('onboarding_templates')
      .insert({ company_id: companyId, name: templateName.trim(), description: templateDesc || null })
      .select().single();
    if (tmpl && templateTasks.length > 0) {
      await supabase.from('onboarding_template_tasks').insert(
        templateTasks.map((t, i) => ({
          template_id: tmpl.id,
          title: t.title,
          description: t.description || null,
          category: t.category,
          due_day_offset: t.due_day_offset,
          sort_order: i,
        }))
      );
    }
    setSaving(false);
    setShowTemplateForm(false);
    setTemplateName(''); setTemplateDesc(''); setTemplateTasks([]);
    revalidatePortalPath('/lead/onboarding');
  }

  /* ─── Start onboarding ───────────────────────────── */
  async function startOnboarding() {
    if (!selectedEmployee || !selectedTemplate) return;
    setSaving(true);
    const template = templates.find(t => t.id === selectedTemplate);
    const employee = employees.find(e => e.id === selectedEmployee);

    const { data: inst } = await supabase
      .from('onboarding_instances')
      .insert({
        company_id: companyId,
        employee_id: selectedEmployee,
        template_id: selectedTemplate,
      })
      .select().single();

    if (inst && template) {
      const startDate = employee?.start_date ? new Date(employee.start_date) : new Date();
      await supabase.from('onboarding_task_progress').insert(
        template.onboarding_template_tasks
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t, i) => {
            const due = new Date(startDate);
            due.setDate(due.getDate() + t.due_day_offset);
            return {
              instance_id: inst.id,
              task_title: t.title,
              task_description: t.description,
              category: t.category,
              due_date: due.toISOString().split('T')[0],
              sort_order: i,
            };
          })
      );
    }
    setSaving(false);
    setShowStartForm(false);
    setSelectedEmployee(''); setSelectedTemplate('');
    revalidatePortalPath('/lead/onboarding');
  }

  /* ─── Toggle task status ─────────────────────────── */
  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    const { error } = await supabase
      .from('onboarding_task_progress')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        completed_by: newStatus === 'completed' ? userId : null,
      })
      .eq('id', taskId);
    if (!error) revalidatePortalPath('/lead/onboarding');
  }

  /* ─── Mark instance complete ─────────────────────── */
  async function completeInstance(instanceId: string) {
    const { error } = await supabase
      .from('onboarding_instances')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', instanceId);
    if (!error) revalidatePortalPath('/lead/onboarding');
  }

  function addTask() {
    setTemplateTasks(prev => [...prev, { title: '', category: 'general', due_day_offset: 0, description: '' }]);
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
          <h2 className="section-title text-xl">Onboarding</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            {activeInstances.length} active · {completedInstances.length} completed · {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTemplateForm(true)} className="btn-secondary btn-sm">
              <Clipboard size={13} /> New Template
            </button>
            <button onClick={() => setShowStartForm(true)} className="btn-cta btn-sm" disabled={templates.length === 0}>
              <Play size={13} /> Start Onboarding
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid var(--line)' }}>
        {[{ key: 'active', label: `Active (${activeInstances.length})` }, { key: 'templates', label: `Templates (${templates.length})` }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: tab === t.key ? 'var(--purple)' : 'var(--ink-faint)',
              borderBottom: tab === t.key ? '2px solid var(--purple)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Active Onboardings ────────────────────────── */}
      {tab === 'active' && (
        <div>
          {activeInstances.length === 0 ? (
            <div className="empty-state">
              <UserPlus size={28} />
              <p className="text-sm font-medium">No active onboardings</p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {templates.length === 0 ? 'Create a template first, then start an onboarding.' : 'Click "Start Onboarding" to begin.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeInstances.map(inst => {
                const emp = inst.employee_records;
                const tasks = inst.onboarding_task_progress.sort((a, b) => a.sort_order - b.sort_order);
                const done = tasks.filter(t => t.status === 'completed').length;
                const total = tasks.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const isExpanded = expandedInstance === inst.id;

                return (
                  <div key={inst.id} className="card">
                    <div
                      className="p-4 flex items-center gap-4 cursor-pointer"
                      onClick={() => setExpandedInstance(isExpanded ? null : inst.id)}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(124,58,237,0.08)' }}
                      >
                        <UserPlus size={16} style={{ color: 'var(--purple)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {emp?.full_name ?? 'Employee'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          {emp?.job_title} · Started {new Date(inst.started_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="hidden sm:block text-right">
                          <p className="text-sm font-bold" style={{ color: pct === 100 ? '#047857' : 'var(--purple)' }}>{pct}%</p>
                          <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{done}/{total} tasks</p>
                        </div>
                        <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10B981' : 'var(--purple)' }} />
                        </div>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
                        <div className="space-y-1.5 mt-3">
                          {tasks.map(task => (
                            <div
                              key={task.id}
                              className="flex items-start gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[var(--surface-soft)]"
                            >
                              <button
                                onClick={() => toggleTask(task.id, task.status)}
                                className="mt-0.5 flex-shrink-0"
                              >
                                {task.status === 'completed' ? (
                                  <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: 'var(--line)' }} />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm"
                                  style={{
                                    color: task.status === 'completed' ? 'var(--ink-faint)' : 'var(--ink)',
                                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                  }}
                                >
                                  {task.task_title}
                                </p>
                                {task.task_description && (
                                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{task.task_description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: `${catColor(task.category)}15`, color: catColor(task.category) }}
                                >
                                  {task.category.replace(/_/g, ' ')}
                                </span>
                                {task.due_date && (
                                  <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                                    {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {pct === 100 && isAdmin && (
                          <button
                            onClick={() => completeInstance(inst.id)}
                            className="btn-cta btn-sm mt-4"
                          >
                            <CheckCircle2 size={13} /> Mark Onboarding Complete
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
              <p className="text-sm font-medium">No templates yet</p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Create a checklist template to standardise your onboarding.</p>
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
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{tmpl.name}</p>
                      {tmpl.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{tmpl.description}</p>}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
                      {tmpl.onboarding_template_tasks.length} tasks
                    </span>
                  </div>
                  <div className="space-y-1">
                    {tmpl.onboarding_template_tasks.sort((a, b) => a.sort_order - b.sort_order).map(task => (
                      <div key={task.id} className="flex items-center gap-2 text-xs py-1">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: catColor(task.category) }} />
                        <span style={{ color: 'var(--ink)' }}>{task.title}</span>
                        {task.due_day_offset > 0 && (
                          <span style={{ color: 'var(--ink-faint)' }}>· Day +{task.due_day_offset}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Template Creation Modal ───────────────────── */}
      {showTemplateForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowTemplateForm(false)} />
          <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl" style={{ animation: 'slideInRight 0.3s ease' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>New Onboarding Template</h3>
              <button onClick={() => setShowTemplateForm(false)} className="btn-icon"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="form-group">
                <label className="label">Template Name *</label>
                <input className="input" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Standard New Starter" />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <input className="input" value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="Optional description" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="label mb-0">Checklist Tasks</label>
                  <button onClick={addTask} className="btn-secondary btn-sm"><Plus size={12} /> Add Task</button>
                </div>
                {templateTasks.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Add tasks to build your onboarding checklist.</p>
                ) : (
                  <div className="space-y-3">
                    {templateTasks.map((task, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--line)' }}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <input className="input" placeholder="Task title *" value={task.title} onChange={e => updateTask(i, 'title', e.target.value)} />
                            <div className="grid grid-cols-2 gap-2">
                              <select className="input" value={task.category} onChange={e => updateTask(i, 'category', e.target.value)}>
                                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                              </select>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--ink-faint)' }}>Day +</span>
                                <input className="input" type="number" min="0" value={task.due_day_offset} onChange={e => updateTask(i, 'due_day_offset', parseInt(e.target.value) || 0)} />
                              </div>
                            </div>
                          </div>
                          <button onClick={() => removeTask(i)} className="btn-icon mt-1"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 px-6 py-4 bg-white" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setShowTemplateForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={saveTemplate} disabled={saving || !templateName.trim()} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start Onboarding Modal ────────────────────── */}
      {showStartForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStartForm(false)} />
          <div className="relative card p-6 w-full max-w-md overflow-y-auto max-h-[calc(100vh-80px)]" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Start Onboarding</h3>
              <button onClick={() => setShowStartForm(false)} className="btn-icon"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Employee *</label>
                <select className="input" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                  <option value="">Select employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.job_title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Template *</label>
                <select className="input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  <option value="">Select template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.onboarding_template_tasks.length} tasks)</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowStartForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={startOnboarding} disabled={saving || !selectedEmployee || !selectedTemplate} className="btn-cta btn-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Start
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
