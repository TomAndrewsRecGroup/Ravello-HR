// Emergency Readiness live-check (go-live gap list, item 3, 2026-10-02).
//
// Migration 154's own header comment already named the intended design:
// "who currently holds that authorisation is read LIVE from
// person_authorisations... never stored here" — but nothing ever
// actually joined that live read into a readiness computation; the
// Emergency Plans UI only ever showed the REQUIRED minimum counts,
// never the CURRENT headcount against them. This file is that join,
// pure composition over rows the admin page already has permission to
// read (person_authorisations, hs_equipment, emergency_drills) — no
// new table, no AI, no score.
//
// Two fixed, named assumptions, deliberately documented rather than
// silently baked in:
//   - a role requirement is "met" when at least min_count people hold
//     that authorisation type, unexpired, as of today — scoped to the
//     plan's own site when the plan names one, company-wide otherwise
//     (the exact scope person_holds_authorisation() itself uses);
//   - a drill is "overdue" when none has been run in the last 365
//     days — a fixed, documented interval (no per-plan drill-frequency
//     column exists on emergency_plans), not a regulatory citation.

export type ReadinessBand = 'ready' | 'attention' | 'critical';

export interface EmergencyPlanRow { id: string; site_id: string | null; plan_type: string; title: string; status: string }
export interface EmergencyPlanRoleRow { plan_id: string; authorisation_type_id: string; min_count: number }
export interface EmergencyPlanEquipmentRow { plan_id: string; asset_id: string }
export interface EmergencyDrillRow { plan_id: string; drill_date: string; outcome: string }
export interface ActiveAuthorisationRow { authorisation_type_id: string; scope_site_id: string | null; status: string; expires_on: string | null }
export interface EquipmentStatusRow { id: string; status: string }

export interface RoleCoverage { authorisationTypeId: string; label: string; required: number; holding: number; met: boolean }
export interface EquipmentCoverage { assetId: string; label: string; status: string; available: boolean }

export interface PlanReadiness {
  planId: string;
  title: string;
  band: ReadinessBand;
  reasons: string[];
  roles: RoleCoverage[];
  equipment: EquipmentCoverage[];
  lastDrillDate: string | null;
  drillOverdue: boolean;
}

const DRILL_OVERDUE_DAYS = 365;
const UNAVAILABLE_EQUIPMENT_STATUSES = new Set(['quarantined', 'out_of_service', 'decommissioned']);

function holdingCount(
  authTypeId: string,
  siteId: string | null,
  holders: readonly ActiveAuthorisationRow[],
  today: string,
): number {
  let n = 0;
  for (const h of holders) {
    if (h.authorisation_type_id !== authTypeId) continue;
    if (h.status !== 'active') continue;
    if (h.expires_on && h.expires_on < today) continue;
    // Scoped to the plan's own site when the authorisation itself
    // names one; an authorisation with no site (company-wide) always
    // counts, matching person_holds_authorisation()'s own scope rule.
    if (siteId && h.scope_site_id && h.scope_site_id !== siteId) continue;
    n++;
  }
  return n;
}

export function computeEmergencyReadiness(
  plans: readonly EmergencyPlanRow[],
  roles: readonly EmergencyPlanRoleRow[],
  equipment: readonly EmergencyPlanEquipmentRow[],
  drills: readonly EmergencyDrillRow[],
  authHolders: readonly ActiveAuthorisationRow[],
  equipmentStatus: readonly EquipmentStatusRow[],
  authTypeNames: Record<string, string>,
  equipmentNames: Record<string, string>,
  today: string,
): PlanReadiness[] {
  const equipmentStatusById = new Map(equipmentStatus.map(e => [e.id, e.status]));
  const out: PlanReadiness[] = [];

  for (const plan of plans) {
    if (plan.status !== 'active') continue;

    const planRoles = roles.filter(r => r.plan_id === plan.id);
    const planEquipment = equipment.filter(e => e.plan_id === plan.id);
    const planDrills = drills.filter(d => d.plan_id === plan.id).sort((a, b) => b.drill_date.localeCompare(a.drill_date));

    const roleCoverage: RoleCoverage[] = planRoles.map(r => {
      const holding = holdingCount(r.authorisation_type_id, plan.site_id, authHolders, today);
      return {
        authorisationTypeId: r.authorisation_type_id,
        label: authTypeNames[r.authorisation_type_id] ?? 'Authorisation',
        required: r.min_count,
        holding,
        met: holding >= r.min_count,
      };
    });

    const equipmentCoverage: EquipmentCoverage[] = planEquipment.map(e => {
      const status = equipmentStatusById.get(e.asset_id) ?? 'unknown';
      return {
        assetId: e.asset_id,
        label: equipmentNames[e.asset_id] ?? 'Equipment',
        status,
        available: !UNAVAILABLE_EQUIPMENT_STATUSES.has(status),
      };
    });

    const lastDrillDate = planDrills[0]?.drill_date ?? null;
    const drillOverdue = lastDrillDate == null
      || (new Date(today).getTime() - new Date(lastDrillDate).getTime()) / 86_400_000 > DRILL_OVERDUE_DAYS;

    const reasons: string[] = [];
    const unmetRoles = roleCoverage.filter(r => !r.met);
    const unavailableEquipment = equipmentCoverage.filter(e => !e.available);

    let band: ReadinessBand = 'ready';
    if (unmetRoles.length > 0) {
      band = 'critical';
      for (const r of unmetRoles) reasons.push(`${r.label}: ${r.holding} of ${r.required} required currently held`);
    }
    if (unavailableEquipment.length > 0) {
      if (band !== 'critical') band = 'attention';
      for (const e of unavailableEquipment) reasons.push(`${e.label} is ${e.status.replace(/_/g, ' ')}`);
    }
    if (drillOverdue) {
      if (band === 'ready') band = 'attention';
      reasons.push(lastDrillDate ? `No drill recorded in the last ${DRILL_OVERDUE_DAYS} days` : 'No drill has ever been recorded');
    }
    if (reasons.length === 0) reasons.push('Every required role is currently held, no linked equipment is unavailable, and a drill is on record within the last year.');

    out.push({ planId: plan.id, title: plan.title, band, reasons, roles: roleCoverage, equipment: equipmentCoverage, lastDrillDate, drillOverdue });
  }

  return out;
}
