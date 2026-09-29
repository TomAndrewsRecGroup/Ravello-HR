// Task rows for an onboarding or offboarding instance, from a template
// (shared-dupe pair: the consumer auto-starts onboarding in admin; the
// portal's offboarding route and onboarding page build the same rows).
//
// due_date = anchor + due_day_offset, in calendar days, UTC. For
// onboarding the anchor is the start date; for offboarding the last
// working day, and offsets may be negative (before the last day).
// assigned_to is copied from the template; before 099 it was captured
// on the template and never reached the task anyone saw.
// gate / gate_days (134) are copied for onboarding: an open gated task
// blocks Safe to Deploy. They are sent ONLY when the template task has a
// gate, because offboarding task rows have no such columns.

export interface TemplateTaskLike {
  title: string;
  description?: string | null;
  category?: string | null;
  due_day_offset?: number | null;
  assigned_to?: string | null;
  sort_order?: number | null;
  gate?: 'none' | 'before_start' | 'before_unsupervised' | 'within_days' | null;
  gate_days?: number | null;
}

export interface TaskRow {
  instance_id:      string;
  task_title:       string;
  task_description: string | null;
  category:         string;
  due_date:         string;
  assigned_to:      string | null;
  sort_order:       number;
  status:           'pending';
  gate?:            'before_start' | 'before_unsupervised' | 'within_days';
  gate_days?:       number | null;
}

export function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function buildTaskRows(instanceId: string, anchorDate: string, tasks: TemplateTaskLike[]): TaskRow[] {
  return [...tasks]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((t, i) => ({
      instance_id:      instanceId,
      task_title:       t.title,
      task_description: t.description ?? null,
      category:         t.category ?? 'general',
      due_date:         addDaysIso(anchorDate, t.due_day_offset ?? 0),
      assigned_to:      t.assigned_to?.trim() || null,
      sort_order:       i,
      status:           'pending' as const,
      ...(t.gate && t.gate !== 'none'
        ? { gate: t.gate, gate_days: t.gate === 'within_days' ? (t.gate_days ?? 0) : null }
        : {}),
    }));
}
