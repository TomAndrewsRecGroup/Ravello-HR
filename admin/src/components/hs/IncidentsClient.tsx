'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Plus, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  HS_INCIDENT_SEVERITIES, HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUSES, HS_INCIDENT_STATUS_LABELS,
  HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS,
  type HsIncidentSeverity, type HsIncidentStatus, type HsIncidentType,
} from '@/lib/hs/vocab';
import type { HsIncident } from '@/lib/hs/types';

interface Props {
  companyId: string;
  canRecord: boolean;
  incidents: HsIncident[];
  loadError: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const SEVERITY_COLOUR: Record<HsIncidentSeverity, string> = {
  minor: 'var(--ink-faint)', significant: 'var(--gold)', major: 'var(--red)', fatal: 'var(--red)',
};

export default function IncidentsClient({ companyId, canRecord, incidents, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HsIncidentType>('near_miss');
  const [severity, setSeverity] = useState<HsIncidentSeverity>('minor');
  const [on, setOn] = useState(today());
  const [description, setDescription] = useState('');
  const [injured, setInjured] = useState('');
  const [action, setAction] = useState('');
  const [riddor, setRiddor] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('hs_incidents').insert({
      company_id: companyId, incident_type: type, severity, occurred_on: on,
      description: description.trim(), injured_person_name: injured.trim() || null,
      immediate_action: action.trim() || null, riddor_reportable: riddor,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Incident recorded', 'success');
    setDescription(''); setInjured(''); setAction(''); setRiddor(false); setOpen(false);
    router.refresh();
  }

  async function setStatus(id: string, status: HsIncidentStatus) {
    const res = await createClient().from('hs_incidents').update({ status }, COUNT_EXACT).eq('id', id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the status.', 'error'); return; }
    router.refresh();
  }

  async function setRiddorReportedOn(id: string, date: string) {
    const res = await createClient().from('hs_incidents').update({ riddor_reported_on: date || null }, COUNT_EXACT).eq('id', id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not save the report date.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load incidents: {loadError}</p>}
      {canRecord && (
        <div className="flex">
          <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Record incident</button>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={type} onChange={e => setType(e.target.value as HsIncidentType)}>
              {HS_INCIDENT_TYPES.map(t => <option key={t} value={t}>{HS_INCIDENT_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input className="input" type="date" value={on} max={today()} onChange={e => setOn(e.target.value)} required />
          </label>
          <label className="block">
            <span className="label">Severity</span>
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value as HsIncidentSeverity)}>
              {HS_INCIDENT_SEVERITIES.map(s => <option key={s} value={s}>{HS_INCIDENT_SEVERITY_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Injured person (optional)</span>
            <input className="input" value={injured} onChange={e => setInjured(e.target.value)} maxLength={200} />
          </label>
          <label className="block md:col-span-2">
            <span className="label">What happened</span>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} required />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Immediate action taken (optional)</span>
            <textarea className="input" rows={2} value={action} onChange={e => setAction(e.target.value)} maxLength={2000} />
          </label>
          <label className="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" checked={riddor} onChange={e => setRiddor(e.target.checked)} />
            <span className="text-sm" style={{ color: 'var(--ink)' }}>RIDDOR reportable</span>
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !description.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Save</button>
          </div>
        </form>
      )}

      {incidents.length === 0 ? (
        <div className="card empty-state p-10">
          <ShieldAlert size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No incidents recorded.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map(inc => (
            <li key={inc.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="badge">{HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</span>
                <strong style={{ color: SEVERITY_COLOUR[inc.severity] }}>{HS_INCIDENT_SEVERITY_LABELS[inc.severity]}</strong>
                {inc.riddor_reportable && (
                  <span className="badge flex items-center gap-1" style={{ background: 'rgba(217,68,68,0.12)', color: 'var(--red)' }}>
                    <AlertTriangle size={11} /> RIDDOR
                  </span>
                )}
                <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(inc.occurred_on)}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{inc.description}</p>
              {inc.injured_person_name && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Injured: {inc.injured_person_name}</p>}
              {inc.immediate_action && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Immediate action: {inc.immediate_action}</p>}
              {canRecord ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <span style={{ color: 'var(--ink-faint)' }}>Status</span>
                    <select className="input input-sm" value={inc.status} onChange={e => setStatus(inc.id, e.target.value as HsIncidentStatus)}>
                      {HS_INCIDENT_STATUSES.map(s => <option key={s} value={s}>{HS_INCIDENT_STATUS_LABELS[s]}</option>)}
                    </select>
                  </label>
                  {inc.riddor_reportable && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <span style={{ color: 'var(--ink-faint)' }}>Reported to HSE on</span>
                      <input className="input input-sm" type="date" defaultValue={inc.riddor_reported_on ?? ''} max={today()}
                        onBlur={e => { if (e.target.value !== (inc.riddor_reported_on ?? '')) setRiddorReportedOn(inc.id, e.target.value); }} />
                    </label>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs" style={{ color: 'var(--ink-faint)' }}>Status: {HS_INCIDENT_STATUS_LABELS[inc.status]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
