import type { Metadata } from 'next';
import { Target } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { OBJECTIVE_STATUS_LABELS, type ObjectiveStatus } from '@/lib/hs/vocab';
import type { Objective, ObjectiveMeasurement } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Objectives & Targets' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_COLOUR: Record<ObjectiveStatus, string> = {
  draft:     'var(--ink-faint)',
  active:    'var(--blue)',
  on_track:  'var(--teal)',
  at_risk:   'var(--gold)',
  achieved:  'var(--success)',
  missed:    'var(--red)',
  abandoned: 'var(--ink-faint)',
};

// Core-OS 360 Phase 5, Group 6 (migration 161). Read-only, staff-managed
// — nothing here is self-certified. Progress status is calculated
// deterministically by the database from the latest measurement; this
// page never recomputes or second-guesses it.
export default async function ProtectObjectivesPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: objectives, error: objError } = await supabase.from('objectives')
    .select('id, company_id, standard_id, title, description, target_value, target_unit, baseline_value, target_direction, target_date, owner_person_id, status, created_by, created_at, updated_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
  const objectiveRows = (objectives ?? []) as Objective[];

  const objectiveIds = objectiveRows.map(o => o.id);
  const { data: measurements, error: mError } = objectiveIds.length > 0
    ? await supabase.from('objective_measurements')
        .select('id, objective_id, company_id, measured_at, value, notes, recorded_by, created_at')
        .in('objective_id', objectiveIds).order('measured_at', { ascending: false }).limit(500)
    : { data: [] as ObjectiveMeasurement[], error: null };
  const measurementRows = (measurements ?? []) as ObjectiveMeasurement[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {(objError || mError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Objectives could not be loaded. Refresh to try again.</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Progress status is calculated automatically from the latest recorded measurement against the stated
        target — never a manual judgement call.
      </div>
      {objectiveRows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Target size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No objectives recorded for your organisation yet</p></div></div>
      ) : (
        <div className="space-y-4">
          {objectiveRows.map(o => {
            const objMeasurements = measurementRows.filter(m => m.objective_id === o.id).slice(0, 5);
            return (
              <div key={o.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong>{o.title}</strong>
                  <span className="ml-auto badge" style={{ color: STATUS_COLOUR[o.status] }}>{OBJECTIVE_STATUS_LABELS[o.status]}</span>
                </div>
                {o.description && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{o.description}</p>}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><span className="label">Target</span><p>{o.target_value ?? '—'} {o.target_unit ?? ''}</p></div>
                  <div><span className="label">Baseline</span><p>{o.baseline_value ?? '—'}</p></div>
                  <div><span className="label">Target date</span><p>{fmt(o.target_date)}</p></div>
                </div>
                {objMeasurements.length > 0 && (
                  <div className="text-sm">
                    <span className="label">Recent measurements</span>
                    <ul className="mt-1 space-y-1">
                      {objMeasurements.map(m => (
                        <li key={m.id} className="flex justify-between">
                          <span>{m.value} {o.target_unit ?? ''}</span>
                          <span style={{ color: 'var(--ink-faint)' }}>{fmt(m.measured_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
