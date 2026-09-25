import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTaskRows, type TemplateTaskLike } from './checklistTasks';
import { addDaysIso } from './checklistTasks';

// Auto-start onboarding for a new employee from the company's default
// template (onboarding_templates.is_default, a column nothing read
// before), and schedule the probation review once.

export async function autoStartOnboarding(sb: SupabaseClient, employeeId: string): Promise<{ started: boolean; reason?: string; taskCount?: number }> {
  const { data: emp } = await sb.from('employee_records').select('id, company_id, start_date, status').eq('id', employeeId).maybeSingle();
  const e = emp as { id: string; company_id: string; start_date: string; status: string } | null;
  if (!e) return { started: false, reason: 'employee not found' };
  if (e.status === 'terminated') return { started: false, reason: 'terminated' };

  const { data: existing } = await sb.from('onboarding_instances').select('id').eq('employee_id', employeeId).limit(1).maybeSingle();
  if (existing) return { started: false, reason: 'already' };

  const { data: tmpl } = await sb.from('onboarding_templates')
    .select('id, onboarding_template_tasks(title, description, category, due_day_offset, assigned_to, sort_order)')
    .eq('company_id', e.company_id).eq('is_default', true).order('created_at').limit(1).maybeSingle();
  const t = tmpl as { id: string; onboarding_template_tasks: TemplateTaskLike[] } | null;
  if (!t) return { started: false, reason: 'no default template' };

  const { data: inst, error } = await sb.from('onboarding_instances')
    .insert({ company_id: e.company_id, employee_id: employeeId, template_id: t.id, status: 'in_progress' }).select('id').single();
  if (error || !inst) throw new Error(`onboarding_instances insert: ${error?.message}`);
  const rows = buildTaskRows((inst as { id: string }).id, e.start_date, t.onboarding_template_tasks ?? []);
  if (rows.length > 0) {
    const { error: tErr } = await sb.from('onboarding_task_progress').insert(rows);
    if (tErr) throw new Error(`onboarding_task_progress insert: ${tErr.message}`);
  }
  return { started: true, taskCount: rows.length };
}

/** One probation review per employee (099 unique source_ref), due a
 *  week before probation ends. Returns true when created now. */
export async function scheduleProbationReview(sb: SupabaseClient, employeeId: string): Promise<boolean> {
  const { data: emp } = await sb.from('employee_records').select('id, company_id, full_name, email, department, probation_end, status').eq('id', employeeId).maybeSingle();
  const e = emp as { id: string; company_id: string; full_name: string; email: string | null; department: string | null; probation_end: string | null; status: string } | null;
  if (!e || !e.probation_end || e.status === 'terminated') return false;
  const { data, error } = await sb.from('performance_reviews').upsert({
    company_id: e.company_id, employee_id: e.id, employee_name: e.full_name, employee_email: e.email, department: e.department,
    review_period: `Probation ending ${e.probation_end}`, review_type: 'probation', status: 'pending',
    due_date: addDaysIso(e.probation_end, -7), source_ref: `probation:${e.id}`,
  }, { onConflict: 'company_id,source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw new Error(`performance_reviews upsert: ${error.message}`);
  return !!data;
}

/** When an employee leaves: pending leave after the end date and open
 *  policy acknowledgements are closed, so nothing waits on someone gone. */
export async function closeOutEmployee(sb: SupabaseClient, employeeId: string, endDate: string | null): Promise<{ absences: number; acks: number }> {
  let absences = 0, acks = 0;
  let q = sb.from('absence_records').update({ status: 'cancelled' }, { count: 'exact' }).eq('employee_id', employeeId).eq('status', 'pending');
  if (endDate) q = q.gt('start_date', endDate);
  const a = await q;
  absences = a.count ?? 0;
  const p = await sb.from('policy_acknowledgements').update({ status: 'cancelled' }, { count: 'exact' }).eq('employee_id', employeeId).in('status', ['pending', 'overdue']);
  acks = p.count ?? 0;
  return { absences, acks };
}
