'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Gauge } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import {
  ENVIRONMENTAL_MONITORING_CATEGORIES, ENVIRONMENTAL_MONITORING_CATEGORY_LABELS, type EnvironmentalMonitoringCategory,
  ENVIRONMENTAL_MONITORING_LIMIT_DIRECTIONS, ENVIRONMENTAL_MONITORING_LIMIT_DIRECTION_LABELS, type EnvironmentalMonitoringLimitDirection,
} from '@/lib/hs/vocab';
import type { EnvironmentalMonitoringReading } from '@/lib/hs/types';

interface Props {
  companyId: string;
  readings: EnvironmentalMonitoringReading[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function limitCell(r: EnvironmentalMonitoringReading): string {
  if (r.recorded_limit === null) return '—';
  if (r.limit_direction === 'range') {
    return r.recorded_limit_upper === null ? `≥ ${r.recorded_limit}` : `${r.recorded_limit}–${r.recorded_limit_upper}`;
  }
  return r.limit_direction === 'lower' ? `min ${r.recorded_limit}` : `max ${r.recorded_limit}`;
}

// Insert-only (a correction is a new reading). within_limit is NEVER
// set here — it is a database-GENERATED column (186), computed only
// when the limit(s) its direction needs are present. Leaving a limit
// blank is a real, honest "no limit on file" state, never guessed at.
// limit_direction defaults to 'upper' — every reading recorded before
// 186 shipped is exactly this, unchanged.
export default function EnvironmentalMonitoringClient({ companyId, readings, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [category, setCategory] = useState<EnvironmentalMonitoringCategory>('other');
  const [parameter, setParameter] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<EnvironmentalMonitoringLimitDirection>('upper');
  const [limit, setLimit] = useState('');
  const [limitUpper, setLimitUpper] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('environmental_monitoring').insert({
      company_id: companyId, category, parameter: parameter.trim(),
      value: Number(value), unit: unit.trim(),
      limit_direction: direction,
      recorded_limit: limit ? Number(limit) : null,
      recorded_limit_upper: direction === 'range' && limitUpper ? Number(limitUpper) : null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Reading recorded', 'success');
    setParameter(''); setValue(''); setUnit(''); setDirection('upper'); setLimit(''); setLimitUpper(''); setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} className="mr-1" /> Record reading</button>
      </div>
      {open && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-3 gap-3 items-end">
          <div><label className="label">Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as EnvironmentalMonitoringCategory)}>
              {ENVIRONMENTAL_MONITORING_CATEGORIES.map(c => <option key={c} value={c}>{ENVIRONMENTAL_MONITORING_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div><label className="label">Parameter</label><input className="input" required value={parameter} onChange={e => setParameter(e.target.value)} placeholder="e.g. Site boundary noise" /></div>
          <div><label className="label">Unit</label><input className="input" required value={unit} onChange={e => setUnit(e.target.value)} /></div>
          <div><label className="label">Value</label><input type="number" required className="input" value={value} onChange={e => setValue(e.target.value)} /></div>
          <div><label className="label">Limit type</label>
            <select className="input" value={direction} onChange={e => setDirection(e.target.value as EnvironmentalMonitoringLimitDirection)}>
              {ENVIRONMENTAL_MONITORING_LIMIT_DIRECTIONS.map(d => <option key={d} value={d}>{ENVIRONMENTAL_MONITORING_LIMIT_DIRECTION_LABELS[d]}</option>)}
            </select>
          </div>
          <div><label className="label">{direction === 'range' ? 'Lower bound (optional)' : 'Recorded limit (optional)'}</label>
            <input type="number" className="input" value={limit} onChange={e => setLimit(e.target.value)} />
          </div>
          {direction === 'range' && (
            <div><label className="label">Upper bound (optional)</label><input type="number" className="input" value={limitUpper} onChange={e => setLimitUpper(e.target.value)} /></div>
          )}
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save reading'}</button>
        </form>
      )}
      {readings.length === 0 ? (
        <div className="card empty-state p-10">
          <Gauge size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No readings recorded yet.</p>
        </div>
      ) : (
        <div className="table-wrapper"><table className="table">
          <thead><tr><th>Date</th><th>Category</th><th>Parameter</th><th>Value</th><th>Limit</th><th>Within limit</th></tr></thead>
          <tbody>
            {readings.map(r => (
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
    </div>
  );
}
