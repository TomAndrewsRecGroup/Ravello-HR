import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeploymentResult } from '@/lib/workforce/types';
import { HEALTH_OUTCOME_COLUMNS, HEALTH_OUTCOME_PRINT_COLUMNS } from '@/lib/workforce/profile';
import type {
  AssignmentRow, AuthSuspensionRow, AuthorisationRow, CheckRow, CompetencyRow, CredentialRow, DevelopmentRow, DuplicateRow,
  ExceptionRow, HealthOutcomeRow, InductionAssignmentRow, InductionCompletionRow, PersonRequirementRow, PersonRow, PpeRow,
  SuspensionRow, TrainingRow,
} from './rows';
import type { StatusLogRow } from '@/lib/workforce/profile';

// Everything the person profile (and its print view) reads, in two
// parallel rounds, under the viewer's own session. RLS (person_visible,
// 135's outcome policy) decides what comes back; `include` only avoids
// asking for what the viewer is not going to be shown. Occupational
// health outcomes are read from person_health_outcomes alone.

const EMPTY = Promise.resolve({ data: [] as unknown[], error: null });

export interface Include {
  health: 'full' | 'print' | false;
  incidents: boolean;
  duplicates: boolean;
  /** Development, PPE, checks, history, exceptions, person rules. */
  extras: boolean;
}

export interface Catalogue {
  courses: { id: string; title: string; validity_months: number | null; safety_critical: boolean; active_status: string }[];
  competencies: { id: string; title: string; safety_critical: boolean; assessment_method: string; renewal_months: number | null; active_status: string }[];
  levels: { id: string; label: string; rank: number }[];
  credentialTypes: { id: string; title: string; kind: string; awarding_body: string | null; validity_months: number | null; active_status: string }[];
  inductions: { id: string; title: string }[];
  authTypes: { id: string; title: string; validity_months: number | null; safety_critical: boolean; active_status: string }[];
  ppeTypes: { id: string; title: string }[];
  checkTypes: { id: string; title: string }[];
  ohRequirements: { id: string; title: string }[];
  roles: { id: string; title: string; safety_critical: boolean; active_status: string }[];
}

export interface ProfileData {
  person: PersonRow | null;
  /** Null when the person is not visible to the viewer. */
  deployment: DeploymentResult | null;
  deploymentError: string | null;
  cannotSee: boolean;
  managerName: string | null;
  assignments: AssignmentRow[];
  training: TrainingRow[];
  competencies: CompetencyRow[];
  suspensions: SuspensionRow[];
  credentials: CredentialRow[];
  inductionAssignments: InductionAssignmentRow[];
  inductionCompletions: InductionCompletionRow[];
  authorisations: AuthorisationRow[];
  authSuspensions: AuthSuspensionRow[];
  ppe: PpeRow[];
  checks: CheckRow[];
  exceptions: ExceptionRow[];
  development: DevelopmentRow[];
  personRequirements: PersonRequirementRow[];
  health: HealthOutcomeRow[];
  log: StatusLogRow[];
  incidents: { id: string; incident_number: string | null; status: string; occurred_on: string | null; incident_type: string | null }[];
  duplicates: DuplicateRow[];
  duplicatesError: string | null;
  catalogue: Catalogue;
}

type Res<T> = { data: T[] | null; error?: { message: string } | null };
const rows = <T>(r: Res<unknown>) => ((r.data ?? []) as T[]);

export async function loadProfile(supabase: SupabaseClient, companyId: string, personId: string, asOf: string | null,
                                  include: Include): Promise<ProfileData> {
  const orgOrGlobal = `company_id.is.null,company_id.eq.${companyId}`;

  const [
    personRes, depRes, asg, tr, comp, susp, cred, ia, ic, auth, ppe, chk, exc, dev, preq, health, log, incp, dups,
    courses, comps, levels, credTypes, inductions, authTypes, ppeTypes, checkTypes, ohReqs, roles,
  ] = await Promise.all([
    supabase.from('people').select('id, full_name, preferred_name, email, worker_type, engagement_type, lifecycle_status, contractor_company, employee_number, start_date, end_date, site_id, department_id, manager_id, primary_role_id, user_id')
      .eq('id', personId).eq('company_id', companyId).maybeSingle(),
    supabase.rpc('person_deployment_status', { p_person: personId, p_as_of: asOf }),
    supabase.from('role_assignments').select('id, role_id, site_id, department_id, primary_assignment, start_date, end_date, assignment_status, ended_reason').eq('person_id', personId)
      .order('start_date', { ascending: false }).limit(200),
    supabase.from('training_records').select('id, course_id, course_name, provider, completed_on, expires_on, result, certificate_number, evidence_path, verification_status, verified_at, rejection_reason, source, submitted_by').eq('person_id', personId)
      .order('completed_on', { ascending: false }).limit(500),
    supabase.from('person_competencies').select('id, competency_id, level_id, assessed_on, expires_on, assessment_method, assessor_name, assessed_by, evidence_path, verification_status, verified_at, rejection_reason, created_at').eq('person_id', personId)
      .order('assessed_on', { ascending: false }).limit(500),
    supabase.from('competency_suspensions').select('id, competency_id, suspended_at, reason, lifted_at, lift_reason').eq('person_id', personId)
      .order('suspended_at', { ascending: false }).limit(200),
    supabase.from('person_credentials').select('id, credential_type_id, credential_number, awarding_body, issued_on, expires_on, evidence_path, verification_status, verified_at, rejection_reason, source, submitted_by').eq('person_id', personId)
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('induction_assignments').select('id, induction_template_id, assigned_on, required_before, status').eq('person_id', personId)
      .order('assigned_on', { ascending: false }).limit(200),
    supabase.from('induction_completions').select('id, induction_template_id, completed_on, delivered_by_name, reinduction_due, evidence_path').eq('person_id', personId)
      .order('completed_on', { ascending: false }).limit(200),
    supabase.from('person_authorisations').select('id, authorisation_type_id, scope_site_id, scope_detail, issuing_authority, issued_on, expires_on, evidence_path, status, revoked_at, revoke_reason').eq('person_id', personId)
      .order('issued_on', { ascending: false }).limit(200),
    include.extras ? supabase.from('ppe_issues').select('id, ppe_type_id, issued_on, replacement_due, serial_number, size, returned_on').eq('person_id', personId)
      .order('issued_on', { ascending: false }).limit(200) : EMPTY,
    include.extras ? supabase.from('pre_employment_checks').select('id, check_type_id, status, requested_on, received_on, evidence_path, verified_at, decision_reason').eq('person_id', personId)
      .order('created_at').limit(100) : EMPTY,
    include.extras ? supabase.from('requirement_exceptions').select('id, requirement_type, reference_id, reference_key, kind, reason, valid_from, valid_until, revoked_at').eq('person_id', personId)
      .order('valid_until', { ascending: false }).limit(200) : EMPTY,
    include.extras ? supabase.from('development_items').select('id, title, source_type, status, due_date, linked_course_id, linked_competency_id, created_at').eq('person_id', personId)
      .order('created_at', { ascending: false }).limit(200) : EMPTY,
    include.extras ? supabase.from('person_requirements').select('id, requirement_type, reference_id, reference_key, mandatory, safety_critical, effective_from, effective_until, source_type, required_by').eq('person_id', personId)
      .order('created_at', { ascending: false }).limit(200) : EMPTY,
    include.health ? supabase.from('person_health_outcomes').select(include.health === 'print' ? HEALTH_OUTCOME_PRINT_COLUMNS : HEALTH_OUTCOME_COLUMNS).eq('person_id', personId)
      .order('assessed_on', { ascending: false }).limit(100) : EMPTY,
    include.extras ? supabase.from('deployment_status_log').select('id, from_status, to_status, reasons, changed_at').eq('person_id', personId)
      .order('changed_at', { ascending: false }).limit(200) : EMPTY,
    include.incidents ? supabase.from('incident_people').select('incident_id').eq('person_id', personId).limit(200) : EMPTY,
    include.duplicates ? supabase.rpc('person_duplicate_candidates', { p_person: personId }) : EMPTY,
    supabase.from('training_courses').select('id, title, validity_months, safety_critical, active_status').or(orgOrGlobal).order('title').limit(500),
    supabase.from('competencies').select('id, title, safety_critical, assessment_method, renewal_months, active_status').or(orgOrGlobal).order('title').limit(500),
    supabase.from('competency_levels').select('id, label, rank').or(orgOrGlobal).order('rank').limit(100),
    supabase.from('credential_types').select('id, title, kind, awarding_body, validity_months, active_status').or(orgOrGlobal).order('title').limit(500),
    supabase.from('induction_templates').select('id, title').eq('company_id', companyId).order('title').limit(500),
    supabase.from('authorisation_types').select('id, title, validity_months, safety_critical, active_status').eq('company_id', companyId).order('title').limit(500),
    supabase.from('ppe_types').select('id, title').or(orgOrGlobal).order('title').limit(500),
    supabase.from('pre_employment_check_types').select('id, title').or(orgOrGlobal).order('title').limit(200),
    include.health ? supabase.from('occupational_health_requirements').select('id, title').or(orgOrGlobal).order('title').limit(200) : EMPTY,
    supabase.from('job_roles').select('id, title, safety_critical, active_status').eq('company_id', companyId).order('title').limit(500),
  ]);

  const person = (personRes.data ?? null) as PersonRow | null;
  const depErr = depRes.error as { code?: string; message: string } | null;
  const cannotSee = !person || depErr?.code === '42501';

  const authRows = rows<AuthorisationRow>(auth);
  const incidentIds = [...new Set(rows<{ incident_id: string }>(incp).map(r => r.incident_id))];
  const [mgr, authSusp, incidents] = await Promise.all([
    person?.manager_id && !cannotSee
      ? supabase.from('people').select('full_name, preferred_name').eq('id', person.manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    authRows.length && !cannotSee
      ? supabase.from('authorisation_suspensions').select('id, authorisation_id, suspended_at, reason, lifted_at, lift_reason')
          .in('authorisation_id', authRows.map(a => a.id)).order('suspended_at', { ascending: false }).limit(500)
      : EMPTY,
    incidentIds.length && !cannotSee
      ? supabase.from('hs_incidents').select('id, incident_number, status, occurred_on, incident_type').in('id', incidentIds).order('occurred_on', { ascending: false }).limit(200)
      : EMPTY,
  ]);
  const m = mgr.data as { full_name: string; preferred_name: string | null } | null;

  return {
    person,
    deployment: depErr ? null : (depRes.data as DeploymentResult | null),
    deploymentError: depErr && depErr.code !== '42501' ? depErr.message : null,
    cannotSee,
    managerName: m ? (m.preferred_name || m.full_name) : null,
    assignments: rows(asg), training: rows(tr), competencies: rows(comp), suspensions: rows(susp), credentials: rows(cred),
    inductionAssignments: rows(ia), inductionCompletions: rows(ic), authorisations: authRows, authSuspensions: rows(authSusp),
    ppe: rows(ppe), checks: rows(chk), exceptions: rows(exc), development: rows(dev), personRequirements: rows(preq),
    health: rows(health), log: rows(log), incidents: rows(incidents),
    duplicates: rows(dups), duplicatesError: (dups as Res<unknown>).error?.message ?? null,
    catalogue: {
      courses: rows(courses), competencies: rows(comps), levels: rows(levels), credentialTypes: rows(credTypes),
      inductions: rows(inductions), authTypes: rows(authTypes), ppeTypes: rows(ppeTypes), checkTypes: rows(checkTypes),
      ohRequirements: rows(ohReqs), roles: rows(roles),
    },
  };
}

/** id → title for a catalogue list. */
export const titles = (list: { id: string; title: string }[]) => Object.fromEntries(list.map(x => [x.id, x.title])) as Record<string, string>;
