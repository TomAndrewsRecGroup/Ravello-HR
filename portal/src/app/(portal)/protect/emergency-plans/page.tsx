import type { Metadata } from 'next';
import { AlertTriangle, Siren } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import {
  EMERGENCY_PLAN_TYPE_LABELS, EMERGENCY_DRILL_OUTCOME_LABELS, type EmergencyDrillOutcome,
} from '@/lib/hs/vocab';
import type { EmergencyDrill, EmergencyPlan, EmergencyPlanEquipment, EmergencyPlanRole } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Emergency Plans' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const DRILL_COLOUR: Record<EmergencyDrillOutcome, string> = {
  successful: 'var(--teal)', issues_found: 'var(--gold)', failed: 'var(--red)',
};

// Read-only: Core OS 360 maintains a client's emergency plans on their
// behalf, the same posture as Register/Documents/Audits/Equipment —
// nothing here is self-certified. Active plans only; the version
// history lives with staff (a new version is a new row, never an edit).
export default async function ProtectEmergencyPlansPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: plans, error: plansError } = await supabase.from('emergency_plans')
    .select('id, company_id, site_id, plan_type, title, description, version, review_due_at, status, supersedes_id, created_by, created_at, updated_at')
    .eq('company_id', companyId).eq('status', 'active').order('title').limit(500);
  const rows = (plans ?? []) as EmergencyPlan[];
  const planIds = rows.map(p => p.id);

  const [
    { data: roles, error: rolesError },
    { data: planEquipment, error: equipError },
    { data: drills, error: drillsError },
    { data: authTypes },
    { data: equipment },
  ] = await Promise.all([
    planIds.length > 0
      ? supabase.from('emergency_plan_roles').select('id, plan_id, authorisation_type_id, min_count, notes').in('plan_id', planIds).limit(500)
      : Promise.resolve({ data: [] as EmergencyPlanRole[], error: null }),
    planIds.length > 0
      ? supabase.from('emergency_plan_equipment').select('id, plan_id, asset_id, notes').in('plan_id', planIds).limit(500)
      : Promise.resolve({ data: [] as EmergencyPlanEquipment[], error: null }),
    supabase.from('emergency_drills')
      .select('id, company_id, plan_id, site_id, drill_date, conducted_by, evacuation_time_seconds, outcome, findings, created_by, created_at')
      .eq('company_id', companyId).order('drill_date', { ascending: false }).limit(500),
    supabase.from('authorisation_types').select('id, title').eq('company_id', companyId).limit(500),
    supabase.from('hs_equipment').select('id, name').eq('company_id', companyId).limit(500),
  ]);

  const error = plansError ?? rolesError ?? equipError ?? drillsError ?? null;
  const roleRows = (roles ?? []) as EmergencyPlanRole[];
  const equipRows = (planEquipment ?? []) as EmergencyPlanEquipment[];
  const drillRows = (drills ?? []) as EmergencyDrill[];
  const authTitle = (id: string) => authTypes?.find(a => a.id === id)?.title ?? 'Unknown role';
  const assetName = (id: string) => equipment?.find(a => a.id === id)?.name ?? 'Unknown asset';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Emergency plans could not be loaded. Refresh to try again.</p>}

      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <Siren size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No emergency plans on file yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(plan => {
            const overdue = plan.review_due_at && plan.review_due_at < today;
            const planRoles = roleRows.filter(r => r.plan_id === plan.id);
            const planEquip = equipRows.filter(e => e.plan_id === plan.id);
            const planDrills = drillRows.filter(d => d.plan_id === plan.id);
            return (
              <div key={plan.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong style={{ color: 'var(--ink)' }}>{plan.title}</strong>
                  <span className="badge">{EMERGENCY_PLAN_TYPE_LABELS[plan.plan_type]}</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>v{plan.version}</span>
                  {plan.review_due_at && (
                    <span className="ml-auto text-sm" style={{ color: overdue ? 'var(--red)' : 'var(--ink-faint)' }}>
                      {overdue && <AlertTriangle size={12} className="inline mr-1" />}
                      Review due {fmt(plan.review_due_at)}
                    </span>
                  )}
                </div>
                {plan.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{plan.description}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Required roles on site</h3>
                    {planRoles.length === 0 ? (
                      <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>None recorded.</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {planRoles.map(r => <li key={r.id} className="badge">{authTitle(r.authorisation_type_id)} × {r.min_count}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Linked equipment</h3>
                    {planEquip.length === 0 ? (
                      <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>None recorded.</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {planEquip.map(e => <li key={e.id} className="badge">{assetName(e.asset_id)}</li>)}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Drill history</h3>
                  {planDrills.length === 0 ? (
                    <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>No drills recorded yet.</p>
                  ) : (
                    <ul className="mt-1 space-y-2">
                      {planDrills.map(d => (
                        <li key={d.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                          <div className="flex flex-wrap gap-x-3">
                            <strong style={{ color: 'var(--ink)' }}>{fmt(d.drill_date)}</strong>
                            <span style={{ color: DRILL_COLOUR[d.outcome] }}>{EMERGENCY_DRILL_OUTCOME_LABELS[d.outcome]}</span>
                            {d.evacuation_time_seconds != null && <span style={{ color: 'var(--ink-faint)' }}>{d.evacuation_time_seconds}s to evacuate</span>}
                          </div>
                          {d.findings && <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{d.findings}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
