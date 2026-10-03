'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import type { WasteStream, WasteMovement, Contractor } from '@/lib/hs/types';
import LinkedActionBadge, { type LinkedActionSummary } from './LinkedActionBadge';

interface Props {
  companyId: string;
  streams: WasteStream[];
  movements: WasteMovement[];
  contractors: Contractor[];
  linkedActions: (LinkedActionSummary & { source_id: string })[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Waste streams are reference data (the "what kind of waste");
// movements are the actual consignments, keyed to a contractor carrier
// (150) — never a second supplier table.
export default function EnvironmentalWasteClient({ companyId, streams, movements, contractors, linkedActions, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [streamOpen, setStreamOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [streamName, setStreamName] = useState('');
  const [wasteCode, setWasteCode] = useState('');
  const [hazardous, setHazardous] = useState(false);

  const [wasteStreamId, setWasteStreamId] = useState(streams[0]?.id ?? '');
  const [movedAt, setMovedAt] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [carrierId, setCarrierId] = useState(contractors[0]?.id ?? '');
  const [nonConformance, setNonConformance] = useState(false);

  async function submitStream(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('waste_streams').insert({
      company_id: companyId, name: streamName.trim(), waste_code: wasteCode.trim() || null, hazardous,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Waste stream added', 'success');
    setStreamName(''); setWasteCode(''); setHazardous(false); setStreamOpen(false);
    router.refresh();
  }

  async function submitMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!wasteStreamId || !carrierId) { toast('A waste stream and a carrier are required', 'error'); return; }
    setBusy(true);
    const { error } = await createClient().from('waste_movements').insert({
      company_id: companyId, waste_stream_id: wasteStreamId, moved_at: movedAt,
      quantity: Number(quantity), unit, carrier_contractor_id: carrierId, non_conformance: nonConformance,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Waste movement recorded', 'success');
    setQuantity(''); setNonConformance(false); setMoveOpen(false);
    router.refresh();
  }

  const streamName_ = (id: string) => streams.find(s => s.id === id)?.name ?? '—';
  const carrierName = (id: string) => contractors.find(c => c.id === id)?.name ?? '—';

  return (
    <div className="space-y-6">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Waste streams</h3>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setStreamOpen(o => !o)}><Plus size={14} className="mr-1" /> Add stream</button>
        </div>
        {streamOpen && (
          <form onSubmit={submitStream} className="grid grid-cols-4 gap-3 items-end">
            <div><label className="label">Name</label><input className="input" required value={streamName} onChange={e => setStreamName(e.target.value)} /></div>
            <div><label className="label">Waste code (EWC)</label><input className="input" value={wasteCode} onChange={e => setWasteCode(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hazardous} onChange={e => setHazardous(e.target.checked)} /> Hazardous</label>
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save</button>
          </form>
        )}
        {streams.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No waste streams yet.</p> : (
          <ul className="text-sm space-y-1">
            {streams.map(s => <li key={s.id}><Trash2 size={12} className="inline mr-1" />{s.name} {s.hazardous && <span className="badge badge-urgent">Hazardous</span>}</li>)}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Waste movements</h3>
          <button type="button" className="btn-cta btn-sm" onClick={() => setMoveOpen(o => !o)}><Plus size={14} className="mr-1" /> Record movement</button>
        </div>
        {moveOpen && (
          <form onSubmit={submitMovement} className="grid grid-cols-3 gap-3 items-end">
            <div><label className="label">Waste stream</label>
              <select className="input" value={wasteStreamId} onChange={e => setWasteStreamId(e.target.value)}>
                {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="label">Moved on</label><input type="date" className="input" value={movedAt} onChange={e => setMovedAt(e.target.value)} /></div>
            <div><label className="label">Carrier</label>
              <select className="input" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Quantity</label><input type="number" min={0} required className="input" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
            <div><label className="label">Unit</label><input className="input" value={unit} onChange={e => setUnit(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nonConformance} onChange={e => setNonConformance(e.target.checked)} /> Non-conformance</label>
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save</button>
          </form>
        )}
        {movements.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No waste movements recorded yet.</p> : (
          <div className="table-wrapper"><table className="table">
            <thead><tr><th>Date</th><th>Stream</th><th>Quantity</th><th>Carrier</th><th>Non-conformance</th><th>Action</th></tr></thead>
            <tbody>
              {movements.map(m => {
                const action = linkedActions.find(a => a.source_id === m.id) ?? null;
                return (
                <tr key={m.id}>
                  <td>{fmt(m.moved_at)}</td>
                  <td>{streamName_(m.waste_stream_id)}</td>
                  <td>{m.quantity} {m.unit}</td>
                  <td>{carrierName(m.carrier_contractor_id)}</td>
                  <td>{m.non_conformance ? <span className="badge badge-urgent">Yes</span> : 'No'}</td>
                  <td>{action && <LinkedActionBadge action={action} />}</td>
                </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
