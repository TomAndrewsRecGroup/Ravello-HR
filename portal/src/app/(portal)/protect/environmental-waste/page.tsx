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
    <main className="portal-page flex-1 space-y-4">
      {(streamsError || movementsError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Waste records could not be loaded. Refresh to try again.</p>}
      {moveRows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Trash2 size={28} style={{ color: 'var(--ink-faint)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No waste movements on file</p></div></div>
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
    </main>
  );
}
