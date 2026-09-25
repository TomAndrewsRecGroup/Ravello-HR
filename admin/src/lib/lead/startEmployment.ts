import type { SupabaseClient } from '@supabase/supabase-js';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// The one join point for "hired". A candidate marked hired, or an offer
// written-accepted, becomes exactly one employee_records row, keyed by
// source_candidate_id (099 unique). The portal's Mark-as-Hired form
// stamps the same column when it creates the record itself, so the
// consumer finds it and creates nothing.

export interface StartEmploymentResult { created: boolean; employeeId: string | null; reason?: string }

const CONTRACT_TO_EMPLOYMENT: Record<string, string> = { permanent: 'full_time', fixed_term: 'fixed_term', contract: 'contractor' };

export async function startEmployment(sb: SupabaseClient, candidateId: string): Promise<StartEmploymentResult> {
  const { data: existing } = await sb.from('employee_records').select('id').eq('source_candidate_id', candidateId).maybeSingle();
  if (existing) return { created: false, employeeId: (existing as { id: string }).id, reason: 'already' };

  const [{ data: cand }, { data: offer }] = await Promise.all([
    sb.from('candidates').select('id, company_id, full_name, email, requisition_id').eq('id', candidateId).maybeSingle(),
    sb.from('offers').select('start_date, base_salary, contract_type, status').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const c = cand as { id: string; company_id: string; full_name: string; email: string | null; requisition_id: string | null } | null;
  if (!c) return { created: false, employeeId: null, reason: 'candidate not found' };
  const o = offer as { start_date: string | null; base_salary: number | null; contract_type: string | null } | null;

  let jobTitle = 'New starter';
  let department: string | null = null;
  if (c.requisition_id) {
    const { data: req } = await sb.from('requisitions').select('title, department').eq('id', c.requisition_id).maybeSingle();
    const r = req as { title?: string; department?: string | null } | null;
    if (r?.title) jobTitle = r.title;
    department = r?.department ?? null;
  }
  // A start date is NOT NULL; without an offer date the record starts
  // today and the client corrects it on the employee page.
  const startDate = o?.start_date ?? new Date().toISOString().slice(0, 10);

  const { data: emp, error } = await sb.from('employee_records').upsert({
    company_id: c.company_id, full_name: c.full_name, email: c.email, job_title: jobTitle, department,
    start_date: startDate, employment_type: CONTRACT_TO_EMPLOYMENT[o?.contract_type ?? ''] ?? 'full_time',
    salary: o?.base_salary != null ? Math.round(o.base_salary / 100) : null,
    status: 'active', source_candidate_id: candidateId,
  }, { onConflict: 'source_candidate_id', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw new Error(`employee_records insert: ${error.message}`);
  if (!emp) return { created: false, employeeId: null, reason: 'already' };

  if (c.requisition_id) {
    const res = await sb.from('requisitions').update({ stage: 'filled' }, COUNT_EXACT).eq('id', c.requisition_id).neq('stage', 'filled');
    judgeWrite({ error: res.error, count: res.count });   // a no-op here is fine: already filled
  }
  return { created: true, employeeId: (emp as { id: string }).id };
}
