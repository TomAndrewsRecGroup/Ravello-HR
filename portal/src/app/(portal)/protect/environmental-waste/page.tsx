import type { Metadata } from 'next';
import { Trash2 } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import type { WasteStream, WasteMovement } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Waste' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Read-only. Waste carriers/disposal sites are Core OS 360's own
// contractor records (150) — this page shows only the client's own
// waste streams and movements, never the wider contractor management.
export default async function ProtectEnvironmentalWastePage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [{ data: streams, error: streamsError }, { data: movements, error: movementsError }] = await Promise.all([
    supabase.from('waste_streams').select('id, company_id, name, waste_code, hazardous, typical_disposal_route, created_by, created_at').eq('company_id', companyId).order('name').limit(500),
    supabase.from('waste_movements').select('id, company_id, waste_stream_id, site_id, moved_at, quantity, unit, carrier_contractor_id, disposal_site_contractor_id, consignment_note_reference, non_conformance, notes, created_by, created_at, updated_at').eq('company_id', companyId).order('moved_at', { ascending: false }).limit(500),
  ]);
  const streamRows = (streams ?? []) as WasteStream[];
  const moveRows = (movements ?? []) as WasteMovement[];
  const streamName = (id: string) => streamRows.find(s => s.id === id)?.name ?? '—';

  return (
    <main className="portal-page flex-1 space-y-6">
      {(streamsError || movementsError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Waste records could not be loaded. Refresh to try again.</p>}

      <section className="card p-4 space-y-3">
        <h3 className="font-semibold">Waste streams</h3>
        {streamRows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No waste streams on file.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {streamRows.map(s => (
              <li key={s.id} className="flex items-center gap-2">
                <Trash2 size={12} style={{ color: 'var(--ink-faint)' }} />
                {s.name}
                {s.waste_code && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{s.waste_code}</span>}
                {s.hazardous && <span className="badge badge-urgent">Hazardous</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h3 className="font-semibold">Waste movements</h3>
        {moveRows.length === 0 ? (
          <div className="p-8"><div className="empty-state"><Trash2 size={28} style={{ color: 'var(--ink-faint)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No waste movements on file</p></div></div>
        ) : (
          <div className="table-wrapper"><table className="table">
            <thead><tr><th>Date</th><th>Stream</th><th>Quantity</th><th>Non-conformance</th></tr></thead>
            <tbody>
              {moveRows.map(m => (
                <tr key={m.id}>
                  <td>{fmt(m.moved_at)}</td>
                  <td>{streamName(m.waste_stream_id)}</td>
                  <td>{m.quantity} {m.unit}</td>
                  <td>{m.non_conformance ? <span className="badge badge-urgent">Yes</span> : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
