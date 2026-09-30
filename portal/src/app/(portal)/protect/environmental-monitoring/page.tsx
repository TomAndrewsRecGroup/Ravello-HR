import type { Metadata } from 'next';
import { Gauge } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { ENVIRONMENTAL_MONITORING_CATEGORY_LABELS } from '@/lib/hs/vocab';
import type { EnvironmentalMonitoringReading } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Environmental Monitoring' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function limitCell(r: EnvironmentalMonitoringReading): string {
  if (r.recorded_limit === null) return '—';
  if (r.limit_direction === 'range') {
    return r.recorded_limit_upper === null ? `≥ ${r.recorded_limit}` : `${r.recorded_limit}–${r.recorded_limit_upper}`;
  }
  return r.limit_direction === 'lower' ? `min ${r.recorded_limit}` : `max ${r.recorded_limit}`;
}

// Read-only. within_limit is never computed here — it comes straight
// off the database's own GENERATED column, NULL until a limit is on
// file, never defaulted true or false.
export default async function ProtectEnvironmentalMonitoringPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data, error } = await supabase.from('environmental_monitoring')
    .select('id, company_id, site_id, category, parameter, value, unit, recorded_limit, limit_direction, recorded_limit_upper, within_limit, recorded_at, recorded_by, created_at')
    .eq('company_id', companyId).order('recorded_at', { ascending: false }).limit(500);
  const rows = (data ?? []) as EnvironmentalMonitoringReading[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Monitoring readings could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Gauge size={28} style={{ color: 'var(--teal)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No monitoring readings on file</p></div></div>
      ) : (
        <div className="table-wrapper"><table className="table">
          <thead><tr><th>Date</th><th>Category</th><th>Parameter</th><th>Value</th><th>Limit</th><th>Within limit</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{fmt(r.recorded_at)}</td>
                <td>{ENVIRONMENTAL_MONITORING_CATEGORY_LABELS[r.category]}</td>
                <td>{r.parameter}</td>
                <td>{r.value} {r.unit}</td>
                <td>{limitCell(r)}</td>
                <td>
                  {r.within_limit === null ? <span style={{ color: 'var(--ink-faint)' }}>No limit on file</span>
                    : r.within_limit ? <span style={{ color: 'var(--teal)' }}>Within limit</span>
                    : <span style={{ color: 'var(--red)' }}>Exceeded limit</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </main>
  );
}
