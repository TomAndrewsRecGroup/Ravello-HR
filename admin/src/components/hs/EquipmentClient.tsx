'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Package, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { HS_EQUIPMENT_STATUS_LABELS, HS_EQUIPMENT_STATUSES, type HsEquipmentStatus } from '@/lib/hs/vocab';
import { daysUntil } from '@/lib/hs/recurrence';
import type { HsEquipment } from '@/lib/hs/types';

interface Props {
  companyId: string;
  canRecord: boolean;
  equipment: HsEquipment[];
  loadError: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

function dueColour(due: string | null, status: HsEquipmentStatus): string {
  if (status !== 'in_service' || !due) return 'var(--ink-faint)';
  const d = daysUntil(due);
  if (d < 0) return 'var(--red)';
  if (d <= 30) return 'var(--gold)';
  return 'var(--teal)';
}

export default function EquipmentClient({ companyId, canRecord, equipment, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [serial, setSerial] = useState('');
  const [lastInspected, setLastInspected] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('hs_equipment').insert({
      company_id: companyId, name: name.trim(), category: category.trim() || null, serial_number: serial.trim() || null,
      last_inspected_on: lastInspected || null, next_inspection_due: nextDue || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Equipment added', 'success');
    setName(''); setCategory(''); setSerial(''); setLastInspected(''); setNextDue(''); setOpen(false);
    router.refresh();
  }

  async function recordInspection(item: HsEquipment) {
    const on = window.prompt('Inspected on (YYYY-MM-DD)', today());
    if (!on) return;
    const next = window.prompt('Next inspection due (YYYY-MM-DD, optional)', item.next_inspection_due ?? '');
    const res = await createClient().from('hs_equipment')
      .update({ last_inspected_on: on, next_inspection_due: next || null }, COUNT_EXACT).eq('id', item.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not record the inspection.', 'error'); return; }
    toast('Inspection recorded', 'success');
    router.refresh();
  }

  async function setStatus(id: string, status: HsEquipmentStatus) {
    const res = await createClient().from('hs_equipment').update({ status }, COUNT_EXACT).eq('id', id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the status.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load equipment: {loadError}</p>}
      {canRecord && (
        <div className="flex">
          <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Add equipment</button>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} required placeholder="Forklift FLT-02" />
          </label>
          <label className="block">
            <span className="label">Category (optional)</span>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} maxLength={100} placeholder="Lifting equipment" />
          </label>
          <label className="block">
            <span className="label">Serial number (optional)</span>
            <input className="input" value={serial} onChange={e => setSerial(e.target.value)} maxLength={100} />
          </label>
          <label className="block">
            <span className="label">Last inspected (optional)</span>
            <input className="input" type="date" value={lastInspected} max={today()} onChange={e => setLastInspected(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Next inspection due (optional)</span>
            <input className="input" type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !name.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Add</button>
          </div>
        </form>
      )}

      {equipment.length === 0 ? (
        <div className="card empty-state p-10">
          <Package size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No equipment on the register.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Equipment</th><th>Category</th><th>Status</th><th>Last inspected</th><th>Next due</th>{canRecord && <th />}</tr>
            </thead>
            <tbody>
              {equipment.map(item => (
                <tr key={item.id}>
                  <td>{item.name}{item.serial_number && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{item.serial_number}</span>}</td>
                  <td>{item.category ?? '—'}</td>
                  <td>
                    {canRecord ? (
                      <select className="input input-sm" value={item.status} onChange={e => setStatus(item.id, e.target.value as HsEquipmentStatus)}>
                        {HS_EQUIPMENT_STATUSES.map(s => <option key={s} value={s}>{HS_EQUIPMENT_STATUS_LABELS[s]}</option>)}
                      </select>
                    ) : HS_EQUIPMENT_STATUS_LABELS[item.status]}
                  </td>
                  <td>{fmt(item.last_inspected_on)}</td>
                  <td style={{ color: dueColour(item.next_inspection_due, item.status), fontWeight: 600 }}>
                    {item.status === 'in_service' && item.next_inspection_due && daysUntil(item.next_inspection_due) < 0 && <AlertTriangle size={12} className="inline mr-1" />}
                    {fmt(item.next_inspection_due)}
                  </td>
                  {canRecord && (
                    <td><button className="btn-ghost btn-sm" onClick={() => recordInspection(item)}>Record inspection</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
