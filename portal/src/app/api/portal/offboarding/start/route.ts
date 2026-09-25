import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { enumOf, isoDate, uuid, z } from '@/lib/validation/primitives';
import { buildTaskRows, type TemplateTaskLike } from '@/lib/lead/checklistTasks';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// POST /api/portal/offboarding/start
//
// The page used to mark the employee TERMINATED the moment offboarding
// began, weeks before their last day: their leave link died, their
// record vanished from the active list, and their pending leave stayed
// pending. Now: the instance and its tasks are created, end_date is
// set to the last working day, and the record stays active until then.
// The reminders cron turns it terminated on the day, which fires the
// employee_left rule (lib/events/leadRules.ts). Own session; RLS scopes
// every write to the caller's company.

export const runtime = 'nodejs';

const Body = z.object({
  employee_id:      uuid,
  template_id:      uuid,
  last_working_day: isoDate,
  reason:           enumOf(['resignation', 'redundancy', 'dismissal', 'end_of_contract', 'retirement', 'other']),
});

export async function POST(req: NextRequest) {
  const { user, role, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (role !== 'client_admin' && role !== 'client_editor') return NextResponse.json({ error: 'You don\'t have permission to start offboarding.' }, { status: 403 });
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { employee_id, template_id, last_working_day, reason } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const [{ data: emp }, { data: tmpl }] = await Promise.all([
    supabase.from('employee_records').select('id, status').eq('id', employee_id).eq('company_id', companyId).maybeSingle(),
    supabase.from('offboarding_templates').select('id, offboarding_template_tasks(title, description, category, due_day_offset, assigned_to, sort_order)').eq('id', template_id).eq('company_id', companyId).maybeSingle(),
  ]);
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const { data: inst, error: instErr } = await supabase.from('offboarding_instances')
    .insert({ company_id: companyId, employee_id, template_id, last_working_day, reason, status: 'in_progress' })
    .select('id').single();
  if (instErr || !inst) return NextResponse.json({ error: instErr?.message ?? 'Could not start offboarding' }, { status: 500 });

  const rows = buildTaskRows((inst as { id: string }).id, last_working_day, ((tmpl as { offboarding_template_tasks: TemplateTaskLike[] }).offboarding_template_tasks ?? []));
  if (rows.length > 0) {
    const { error: tErr } = await supabase.from('offboarding_task_progress').insert(rows);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const patch = last_working_day <= today ? { end_date: last_working_day, status: 'terminated' } : { end_date: last_working_day };
  const res = await supabase.from('employee_records').update(patch, COUNT_EXACT).eq('id', employee_id).eq('company_id', companyId);
  const outcome = judgeWrite({ error: res.error, count: res.count }, 'The employee record');
  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: 500 });

  return NextResponse.json({ ok: true, instance_id: (inst as { id: string }).id, tasks: rows.length, terminated: last_working_day <= today });
}
