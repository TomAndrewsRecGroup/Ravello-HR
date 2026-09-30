import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { Objective, ObjectiveMeasurement, ManagementSystemStandard, RequirementEvidenceLink } from '@/lib/hs/types';
import ObjectivesClient from '@/components/hs/ObjectivesClient';

export const metadata: Metadata = { title: 'Objectives & targets' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 6 (migration 161). Progress against each
// objective is a DETERMINISTIC roll from the latest measurement, done
// entirely by the database (objective_measurements_roll()) — this page
// only displays what the database already decided, and lets staff add
// a new objective, record a measurement, or link a standard.
export default async function HealthSafetyObjectivesPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: objectives, error: objError }, { data: standards, error: stdError }, people] = await Promise.all([
    supabase.from('objectives')
      .select('id, company_id, standard_id, title, description, target_value, target_unit, baseline_value, target_direction, target_date, owner_person_id, status, created_by, created_at, updated_at')
      .eq('company_id', params.companyId).order('created_at', { ascending: false }),
    supabase.from('management_system_standards').select('id, code, name, created_at').order('code'),
    readAllPages<{ id: string; full_name: string }>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', params.companyId).order('full_name').order('id').range(from, to)),
  ]);

  const objectiveRows = (objectives ?? []) as Objective[];
  const objectiveIds = objectiveRows.map(o => o.id);
  const [{ data: measurements, error: mError }, { data: evidenceLinks, error: linksError }] = await Promise.all([
    objectiveIds.length > 0
      ? supabase.from('objective_measurements')
          .select('id, objective_id, company_id, measured_at, value, notes, recorded_by, created_at')
          .in('objective_id', objectiveIds).order('measured_at', { ascending: false })
      : Promise.resolve({ data: [] as ObjectiveMeasurement[], error: null }),
    // Evidence-link foundation (163) — fetched by id list, never blind.
    objectiveIds.length > 0
      ? supabase.from('requirement_evidence_links')
          .select('id, company_id, source_type, source_id, entity_type, entity_id, added_by, created_at')
          .eq('source_type', 'objective').in('source_id', objectiveIds)
      : Promise.resolve({ data: [] as RequirementEvidenceLink[], error: null }),
  ]);

  return (
    <ObjectivesClient
      companyId={params.companyId}
      objectives={objectiveRows}
      measurements={(measurements ?? []) as ObjectiveMeasurement[]}
      standards={(standards ?? []) as ManagementSystemStandard[]}
      people={people.rows}
      evidenceLinks={(evidenceLinks ?? []) as RequirementEvidenceLink[]}
      loadError={objError?.message ?? stdError?.message ?? mError?.message ?? linksError?.message ?? null}
    />
  );
}
