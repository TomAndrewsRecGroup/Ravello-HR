import type { Metadata } from 'next';
import { Droplets } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS, ENVIRONMENTAL_SPILL_STATUS_LABELS } from '@/lib/hs/vocab';
import type { EnvironmentalSpill } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Environmental Spills' };
export const dynamic = 'force-dynamic';

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

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Spills could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Droplets size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No spills on file</p></div></div>
      ) : (
        <div className="space-y-3">
          {rows.map(s => (
            <div key={s.id} className="card p-4 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong>{s.substance}</strong>
                <span className="badge">{ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS[s.receiving_environment]}</span>
                <span className="ml-auto text-sm font-medium">{ENVIRONMENTAL_SPILL_STATUS_LABELS[s.status]}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(s.occurred_at)} · {s.contained ? 'Contained' : 'Not yet contained'}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
