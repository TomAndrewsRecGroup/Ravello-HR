import type { SupabaseClient } from '@supabase/supabase-js';

// employee_records' sensitive columns (migration 131).
//
// A session may SELECT only the columns in EMPLOYEE_SAFE_COLUMNS: salary,
// NI number, tax code, date of birth, diversity data, address, emergency
// contacts, notes and the leave-link token are not granted, so naming one
// in a `.select()` (or `*`, or a bare `.select()` after a write) is a
// permission error. They come back only through employee_private_fields(),
// which blanks the HR fields unless the caller holds hr.sensitive.read and
// the leave token unless they may manage leave links.
//
// employeePrivate.test.ts pins both lists against 131's SQL.

/** Every column a session may read. Use this instead of `*`. */
// One string literal: supabase-js infers the row type from the literal.
// row_version (Phase 28, migration 197) is an additive grant on top of
// 131's own full re-GRANT — the optimistic-lock column an edit form
// conditions its UPDATE on.
export const EMPLOYEE_SAFE_COLUMNS = 'id,company_id,full_name,email,phone,employee_number,job_title,department,employment_type,status,start_date,end_date,probation_end,line_manager,work_location,contract_hours,annual_leave_allowance,sick_day_allowance,leave_year_type,leave_year_start_month,leave_year_start_day,data_consent_at,sensitive_data_redacted,created_at,updated_at,source_candidate_id,person_id,department_id,site_id,row_version';

/** HR-sensitive fields: readable and writable only with hr.sensitive.*. */
export const EMPLOYEE_HR_FIELDS = [
  'salary', 'salary_currency', 'pay_frequency',
  'date_of_birth', 'gender', 'ethnicity', 'nationality', 'disability_status',
  'ni_number', 'tax_code',
  'emergency_name', 'emergency_phone', 'emergency_relation',
  'address', 'notes',
] as const;
export type EmployeeHrField = typeof EMPLOYEE_HR_FIELDS[number];

export interface EmployeePrivate {
  id: string;
  hr_visible: boolean;
  salary: number | null;
  salary_currency: string | null;
  pay_frequency: string | null;
  date_of_birth: string | null;
  gender: string | null;
  ethnicity: string | null;
  nationality: string | null;
  disability_status: string | null;
  ni_number: string | null;
  tax_code: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  address: string | null;
  notes: string | null;
  leave_token: string | null;
}

/** The gated fields for one organisation's employees, by id. A failed read
 *  returns an empty map: every field then reads as not visible, never as
 *  a wrong value. */
export async function readEmployeePrivate(
  supabase: SupabaseClient, companyId: string, ids?: string[],
): Promise<Map<string, EmployeePrivate>> {
  const { data, error } = await supabase.rpc('employee_private_fields', { p_company: companyId, p_ids: ids ?? null });
  if (error || !Array.isArray(data)) return new Map();
  return new Map((data as EmployeePrivate[]).map(r => [r.id, r]));
}

/** Rows with their gated fields merged in. A field the viewer may not see
 *  stays null; `hr_visible` says which. */
export function withPrivate<T extends { id: string }>(
  rows: T[], priv: Map<string, EmployeePrivate>,
): (T & Omit<EmployeePrivate, 'id'>)[] {
  return rows.map(r => {
    const p = priv.get(r.id);
    const merged = { ...r } as T & Omit<EmployeePrivate, 'id'>;
    for (const f of EMPLOYEE_HR_FIELDS) (merged as Record<string, unknown>)[f] = p?.[f] ?? null;
    merged.leave_token = p?.leave_token ?? null;
    merged.hr_visible = p?.hr_visible ?? false;
    return merged;
  });
}

/** Drop the HR fields from a write payload for someone who may not write
 *  them — the database would refuse the whole write, and they were never
 *  shown the current values, so sending blanks would wipe them. */
export function withoutHrFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = { ...payload };
  for (const f of EMPLOYEE_HR_FIELDS) delete out[f];
  delete out.leave_token;
  return out as Partial<T>;
}
