'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Droplets } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS, ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS,
  ENVIRONMENTAL_SPILL_STATUSES, ENVIRONMENTAL_SPILL_STATUS_LABELS,
  type EnvironmentalSpillReceivingEnvironment, type EnvironmentalSpillStatus,
} from '@/lib/hs/vocab';
import type { EnvironmentalSpill } from '@/lib/hs/types';

interface Props {
  companyId: string;
  spills: EnvironmentalSpill[];
  loadError: string | null;
}

// A fresh, uncontained spill must never look identical to a closed one —
// the same colour-badge-next-to-a-select pattern IncidentsClient.tsx
// already uses for a mutable status.
const STATUS_COLOUR: Record<EnvironmentalSpillStatus, string> = {
  reported: 'var(--red)',
  contained: 'var(--gold)',
  closed: 'var(--ink-faint)',
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function EnvironmentalSpillsClient({ companyId, spills, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [substance, setSubstance] = useState('');
  const [receiving, setReceiving] = useState<EnvironmentalSpillReceivingEnvironment>('land');
  const [volume, setVolume] = useState('');
  const [unit, setUnit] = useState('litres');
  const [contained, setContained] = useState(false);
  const [notifiedAuthority, setNotifiedAuthority] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('environmental_spills').insert({
      company_id: companyId,
      occurred_at: new Date().toISOString(),
      substance: substance.trim(),
      receiving_environment: receiving,
      estimated_volume: volume ? Number(volume) : null,
      volume_unit: volume ? unit : null,
      contained,
      notified_authority: notifiedAuthority,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Spill recorded', 'success');
    setSubstance(''); setVolume(''); setContained(false); setNotifiedAuthority(false); setOpen(false);
    router.refresh();
  }

  async function updateStatus(spill: EnvironmentalSpill, status: EnvironmentalSpillStatus) {
    const res = await createClient().from('environmental_spills').update({ status }, COUNT_EXACT).eq('id', spill.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}>
          <Plus size={14} className="mr-1" /> Record spill
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Substance</label>
              <input className="input" required value={substance} onChange={e => setSubstance(e.target.value)} />
            </div>
            <div>
              <label className="label">Receiving environment</label>
              <select className="input" value={receiving} onChange={e => setReceiving(e.target.value as EnvironmentalSpillReceivingEnvironment)}>
                {ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS.map(r => <option key={r} value={r}>{ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estimated volume</label>
              <input type="number" min={0} className="input" value={volume} onChange={e => setVolume(e.target.value)} />
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contained} onChange={e => setContained(e.target.checked)} /> Contained</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notifiedAuthority} onChange={e => setNotifiedAuthority(e.target.checked)} /> Authority notified</label>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save spill'}</button>
        </form>
      )}
      {spills.length === 0 ? (
        <div className="card empty-state p-10">
          <Droplets size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No spills recorded.</p>
        </div>
      ) : (
        <div className="table-wrapper"><table className="table">
          <thead><tr><th>Occurred</th><th>Substance</th><th>Receiving</th><th>Contained</th><th>Status</th></tr></thead>
          <tbody>
            {spills.map(s => (
              <tr key={s.id}>
                <td>{fmt(s.occurred_at)}</td>
                <td>{s.substance}</td>
                <td>{ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS[s.receiving_environment]}</td>
                <td>{s.contained ? 'Yes' : 'No'}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="badge" style={{ color: STATUS_COLOUR[s.status] }}>{ENVIRONMENTAL_SPILL_STATUS_LABELS[s.status]}</span>
                    <select className="input input-sm" value={s.status} onChange={e => updateStatus(s, e.target.value as EnvironmentalSpillStatus)}>
                      {ENVIRONMENTAL_SPILL_STATUSES.map(st => <option key={st} value={st}>{ENVIRONMENTAL_SPILL_STATUS_LABELS[st]}</option>)}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
