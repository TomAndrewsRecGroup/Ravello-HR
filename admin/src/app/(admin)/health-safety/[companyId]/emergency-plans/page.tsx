import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EmergencyDrill, EmergencyPlan, EmergencyPlanEquipment, EmergencyPlanRole } from '@/lib/hs/types';
import EmergencyPlansClient from '@/components/hs/EmergencyPlansClient';
import { computeEmergencyReadiness, type ActiveAuthorisationRow, type EquipmentStatusRow } from '@/lib/emergencyReadiness/compute';

export const metadata: Metadata = { title: 'H&S emergency plans' };
export const dynamic = 'force-dynamic';

interface PickRow { id: string; name?: string; title?: string }

// Emergency planning (154): plans reuse hs_documents' own versioning
// discipline (a new version is a new row); drills are insert-only, the
// register's own "a correction is a new row" rule.
export default async function HealthSafetyEmergencyPlansPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [plans, drills, sites, equipment, people, authTypes] = await Promise.all([
    readAllPages<EmergencyPlan>((from, to) =>
      supabase.from('emergency_plans')
        .select('id, company_id, site_id, plan_type, title, description, version, review_due_at, status, supersedes_id, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('created_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<EmergencyDrill>((from, to) =>
      supabase.from('emergency_drills')
        .select('id, company_id, plan_id, site_id, drill_date, conducted_by, evacuation_time_seconds, outcome, findings, created_by, created_at')
        .eq('company_id', params.companyId).order('drill_date', { ascending: false }).order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('hs_sites').select('id, name').eq('company_id', params.companyId).eq('active', true).order('name').order('id').range(from, to)),
    readAllPages<PickRow & { status?: string }>((from, to) =>
      supabase.from('hs_equipment').select('id, name, status').eq('company_id', params.companyId).order('name').order('id').range(from, to)),
    readAllPages<{ id: string; full_name: string }>((from, to) =>
      supabase.from('people').select('id, full_name').eq('company_id', params.companyId).order('full_name').order('id').range(from, to)),
    readAllPages<PickRow>((from, to) =>
      supabase.from('authorisation_types').select('id, title').eq('company_id', params.companyId).order('title').order('id').range(from, to)),
  ]);

  // Roles and linked equipment are scoped to THIS company's own plans —
  // fetched after plans, not in the same Promise.all, so the filter has
  // planIds to use (readAllPages needs a stable, unique sort key too).
  const planIds = plans.rows.map(p => p.id);
  const [roles, planEquipment] = planIds.length === 0
    ? [{ rows: [] as EmergencyPlanRole[], error: null }, { rows: [] as EmergencyPlanEquipment[], error: null }]
    : await Promise.all([
        readAllPages<EmergencyPlanRole>((from, to) =>
          supabase.from('emergency_plan_roles').select('id, plan_id, authorisation_type_id, min_count, notes')
            .in('plan_id', planIds).order('id').range(from, to)),
        readAllPages<EmergencyPlanEquipment>((from, to) =>
          supabase.from('emergency_plan_equipment').select('id, plan_id, asset_id, notes')
            .in('plan_id', planIds).order('id').range(from, to)),
      ]);

  // Emergency Readiness live-check (go-live gap list, item 3): who
  // CURRENTLY holds each required authorisation, read directly from
  // person_authorisations under this same staff session — the exact
  // live join migration 154's own header comment already named as the
  // intended design, never built into this page until now.
  const authHolders = planIds.length === 0 || roles.rows.length === 0
    ? { rows: [] as ActiveAuthorisationRow[], error: null }
    : await readAllPages<ActiveAuthorisationRow>((from, to) =>
        supabase.from('person_authorisations').select('authorisation_type_id, scope_site_id, status, expires_on')
          .eq('company_id', params.companyId)
          .in('authorisation_type_id', [...new Set(roles.rows.map(r => r.authorisation_type_id))])
          .order('id').range(from, to));

  const today = new Date().toISOString().slice(0, 10);
  const authTypeNames = Object.fromEntries(authTypes.rows.map(a => [a.id, a.title ?? 'Authorisation']));
  const equipmentNames = Object.fromEntries(equipment.rows.map(e => [e.id, e.name ?? 'Equipment']));
  const equipmentStatusRows: EquipmentStatusRow[] = equipment.rows.map(e => ({ id: e.id, status: e.status ?? 'in_service' }));

  const readiness = computeEmergencyReadiness(
    plans.rows.map(p => ({ id: p.id, site_id: p.site_id, plan_type: p.plan_type, title: p.title, status: p.status })),
    roles.rows.map(r => ({ plan_id: r.plan_id, authorisation_type_id: r.authorisation_type_id, min_count: r.min_count })),
    planEquipment.rows.map(e => ({ plan_id: e.plan_id, asset_id: e.asset_id })),
    drills.rows.map(d => ({ plan_id: d.plan_id, drill_date: d.drill_date, outcome: d.outcome })),
    authHolders.rows,
    equipmentStatusRows,
    authTypeNames,
    equipmentNames,
    today,
  );

  const loadError = [plans, roles, planEquipment, drills, sites, equipment, people, authTypes, authHolders]
    .map(r => r.error).find(Boolean) ?? null;

  return (
    <EmergencyPlansClient
      companyId={params.companyId}
      plans={plans.rows}
      roles={roles.rows}
      planEquipment={planEquipment.rows}
      drills={drills.rows}
      sites={sites.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
      equipment={equipment.rows.map(r => ({ id: r.id, name: r.name ?? '' }))}
      people={people.rows.map(r => ({ id: r.id, name: r.full_name ?? '' }))}
      authorisationTypes={authTypes.rows.map(r => ({ id: r.id, title: r.title ?? '' }))}
      loadError={loadError}
      readiness={readiness}
    />
  );
}
