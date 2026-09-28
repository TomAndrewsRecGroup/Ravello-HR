import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogueOption } from '@/lib/workforce/requirements';

export interface LevelOption { id: string; label: string; rank: number; company_id: string | null; description: string | null }

// Every catalogue a requirement rule can point at, for the organisation
// being acted in: global rows (company_id NULL) and this organisation's
// own. RLS already limits reads to those; the explicit filter keeps a
// staff session (which can read every organisation) to the active one.
// Inactive rows are loaded so an existing rule can still be named.
export async function loadRuleCatalogues(supabase: SupabaseClient, companyId: string): Promise<{
  byTable: Record<string, CatalogueOption[]>;
  levels: LevelOption[];
  error: boolean;
}> {
  const scope = `company_id.is.null,company_id.eq.${companyId}`;
  const [courses, comps, creds, inds, oh, auths, ppe, checks, levels] = await Promise.all([
    supabase.from('training_courses').select('id, title, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('competencies').select('id, title, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('credential_types').select('id, title, kind, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('induction_templates').select('id, title, company_id, active_status').eq('company_id', companyId).order('title').limit(999),
    supabase.from('occupational_health_requirements').select('id, title, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('authorisation_types').select('id, title, company_id, active_status').eq('company_id', companyId).order('title').limit(999),
    supabase.from('ppe_types').select('id, title, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('pre_employment_check_types').select('id, title, company_id, active_status').or(scope).order('title').limit(999),
    supabase.from('competency_levels').select('id, label, rank, company_id, description').or(scope).order('rank').limit(100),
  ]);
  type Raw = { id: string; title: string; company_id: string | null; active_status: string; kind?: string | null };
  const map = (rows: unknown[] | null): CatalogueOption[] =>
    ((rows ?? []) as Raw[]).map(r => ({ id: r.id, title: r.title, kind: r.kind ?? null, company_id: r.company_id, active: r.active_status === 'active' }));
  const all = [courses, comps, creds, inds, oh, auths, ppe, checks, levels];
  return {
    byTable: {
      training_courses: map(courses.data),
      competencies: map(comps.data),
      credential_types: map(creds.data),
      induction_templates: map(inds.data),
      occupational_health_requirements: map(oh.data),
      authorisation_types: map(auths.data),
      ppe_types: map(ppe.data),
      pre_employment_check_types: map(checks.data),
    },
    levels: (levels.data ?? []) as LevelOption[],
    error: all.some(r => !!r.error),
  };
}
