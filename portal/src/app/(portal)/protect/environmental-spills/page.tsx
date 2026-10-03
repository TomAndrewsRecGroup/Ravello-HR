import type { Metadata } from 'next';
import { Droplets } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS, ENVIRONMENTAL_SPILL_STATUS_LABELS, type EnvironmentalSpillStatus } from '@/lib/hs/vocab';
import type { EnvironmentalSpill } from '@/lib/hs/types';
import LinkedActionBadge, { type LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

export const metadata: Metadata = { title: 'Environmental Spills' };
export const dynamic = 'force-dynamic';

// A fresh, uncontained spill must never look identical to a closed one —
// mirrors admin's EnvironmentalSpillsClient.tsx STATUS_COLOUR exactly.
const STATUS_COLOUR: Record<EnvironmentalSpillStatus, string> = {
  reported: 'var(--red)',
  contained: 'var(--gold)',
  closed: 'var(--ink-faint)',
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Read-only: Core OS 360 records spills on a client's behalf, the same
// posture as every other H&S register page — nothing here is
// self-certified.
export default async function ProtectEnvironmentalSpillsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data, error } = await supabase.from('environmental_spills')
    .select('id, company_id, site_id, occurred_at, substance, estimated_volume, volume_unit, receiving_environment, contained, notified_authority, notified_at, hs_incident_id, status, created_by, created_at, updated_at')
    .eq('company_id', companyId).order('occurred_at', { ascending: false }).limit(500);
  const rows = (data ?? []) as EnvironmentalSpill[];

  // UI/UX cross-linking pass (2026-10-03): mirrors admin's own spills
  // page fix — an uncontained spill raises a real corrective action
  // (environmentalRules.ts's own rule, source_type=
  // 'environmental_spill', source_id=the spill's own id).
  const spillIds = rows.map(s => s.id);
  const { data: linkedActions } = spillIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at, source_id')
        .eq('company_id', companyId).eq('source_type', 'environmental_spill').in('source_id', spillIds).limit(500)
    : { data: [] as (LinkedActionSummary & { source_id: string })[] };
  const linkedActionRows = (linkedActions ?? []) as (LinkedActionSummary & { source_id: string })[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Spills could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Droplets size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No spills on file</p></div></div>
      ) : (
        <div className="space-y-3">
          {rows.map(s => {
            const action = linkedActionRows.find(a => a.source_id === s.id) ?? null;
            return (
            <div key={s.id} className="card p-4 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong>{s.substance}</strong>
                <span className="badge">{ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS[s.receiving_environment]}</span>
                <span className="ml-auto badge" style={{ color: STATUS_COLOUR[s.status] }}>{ENVIRONMENTAL_SPILL_STATUS_LABELS[s.status]}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(s.occurred_at)} · {s.contained ? 'Contained' : 'Not yet contained'}</p>
              {action && <LinkedActionBadge action={action} />}
            </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
