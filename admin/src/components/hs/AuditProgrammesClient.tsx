'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { AUDIT_PROGRAMME_FREQUENCIES, AUDIT_PROGRAMME_FREQUENCY_LABELS, type AuditProgrammeFrequency } from '@/lib/hs/vocab';
import type { AuditProgramme } from '@/lib/hs/types';

interface Props {
  companyId: string;
  programmes: AuditProgramme[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

// Core-OS 360 Phase 5, Group 7 (162): a planned SCHEDULE of audits —
// nothing here runs an audit itself. hs_audits/hs_audit_templates (the
// on-site checklist engine) are unchanged and unrelated to this table.
export default function AuditProgrammesClient({ companyId, programmes, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<AuditProgrammeFrequency>('quarterly');
  const [nextDue, setNextDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('audit_programmes').insert({
      company_id: companyId, name: name.trim(), frequency, next_due_date: nextDue || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Audit programme added', 'success');
    setName(''); setNextDue(''); setOpen(false);
    router.refresh();
  }

  async function toggleActive(p: AuditProgramme) {
    const res = await createClient().from('audit_programmes').update({ active: !p.active }, COUNT_EXACT).eq('id', p.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the programme.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load audit programmes: {loadError}</p>}
      <div className="flex">
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Add programme</button>
      </div>

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={200} required placeholder="e.g. Quarterly fire audit" />
          </label>
          <label className="block">
            <span className="label">Frequency</span>
            <select className="input" value={frequency} onChange={e => setFrequency(e.target.value as AuditProgrammeFrequency)}>
              {AUDIT_PROGRAMME_FREQUENCIES.map(f => <option key={f} value={f}>{AUDIT_PROGRAMME_FREQUENCY_LABELS[f]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Next due</span>
            <input className="input" type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
          </label>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !name.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Add
            </button>
          </div>
        </form>
      )}

      {programmes.length === 0 ? (
        <div className="card empty-state p-10">
          <CalendarClock size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No audit programmes scheduled.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {programmes.map(p => (
            <li key={p.id} className="card p-4 flex flex-wrap items-center gap-3">
              <strong style={{ color: 'var(--ink)' }}>{p.name}</strong>
              <span className="badge">{AUDIT_PROGRAMME_FREQUENCY_LABELS[p.frequency]}</span>
              {!p.active && <span className="badge" style={{ color: 'var(--ink-faint)' }}>Paused</span>}
              <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>Next due: {fmt(p.next_due_date)}</span>
              <button className="btn-secondary btn-sm" onClick={() => toggleActive(p)}>{p.active ? 'Pause' : 'Resume'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
