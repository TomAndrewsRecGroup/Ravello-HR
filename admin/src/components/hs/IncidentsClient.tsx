'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Plus, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  HS_INCIDENT_SEVERITIES, HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUS_LABELS,
  HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS, incidentNextStatuses,
  type HsIncidentSeverity, type HsIncidentStatus, type HsIncidentType,
} from '@/lib/hs/vocab';
import {
  INCIDENT_IMMEDIATE_ACTIONS, INCIDENT_IMMEDIATE_ACTION_LABELS, RIDDOR_REVIEW_STATUS_LABELS,
  type IncidentImmediateAction, type RiddorReviewStatus,
} from '@/lib/hs/safetyVocab';
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
  minor: 'var(--ink-faint)', moderate: 'var(--gold)', serious: 'var(--gold)',
  major: 'var(--red)', critical: 'var(--red)', fatal: 'var(--red)',
};

// Staff view of one client's incident log (125). Numbers, the reporter,
// the RIDDOR outcome and every stamp are set by the database; this form
// never sends them. The injured person and their injury detail live in
// incident_people / incident_person_sensitive, never on this row.
export default function IncidentsClient({ companyId, canRecord, incidents, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<HsIncidentType>('near_miss');
  const [title, setTitle] = useState('');
  const [on, setOn] = useState(today());
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [immediate, setImmediate] = useState<IncidentImmediateAction[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('hs_incidents').insert({
      company_id: companyId, incident_type: type, title: title.trim(), occurred_on: on,
      exact_location: location.trim(), description: description.trim(), immediate_actions: immediate,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Incident reported', 'success');
    setTitle(''); setLocation(''); setDescription(''); setImmediate([]); setOpen(false);
    router.refresh();
  }

  async function update(inc: HsIncident, patch: Record<string, unknown>, failMsg: string) {
    const res = await createClient().from('hs_incidents').update(patch, COUNT_EXACT)
      .eq('id', inc.id).eq('row_version', inc.row_version);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) {
      toast(res.count === 0 && !res.error ? 'Someone else changed this incident — refresh and try again.' : (outcome.message ?? failMsg), 'error');
      return;
    }
    router.refresh();
  }

  async function moveTo(inc: HsIncident, status: HsIncidentStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === 'closed') {
      const reason = window.prompt('Closing records who closed it. If anything is still open (actions, investigation, RIDDOR), give the reason for closing anyway — otherwise leave blank.') ?? null;
      if (reason === null) return;
      if (reason.trim()) patch.close_override_reason = reason.trim();
    }
    await update(inc, patch, 'Could not change the status.');
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load incidents: {loadError}</p>}
      {canRecord && (
        <div className="flex">
          <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Report incident</button>
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
          <label className="block md:col-span-2">
            <span className="label">Short title</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
              placeholder="e.g. Hand caught in press" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Where it happened</span>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} maxLength={300} required />
          </label>
          <label className="block md:col-span-2">
            <span className="label">What happened</span>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} required />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="label">Immediate actions taken</legend>
            <div className="flex flex-wrap gap-3">
              {INCIDENT_IMMEDIATE_ACTIONS.map(a => (
                <label key={a} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink)' }}>
                  <input type="checkbox" checked={immediate.includes(a)}
                    onChange={e => setImmediate(cur => e.target.checked ? [...cur, a] : cur.filter(x => x !== a))} />
                  {INCIDENT_IMMEDIATE_ACTION_LABELS[a]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="md:col-span-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
            People involved, injury detail and the RIDDOR review are recorded on the incident itself, with their own permissions.
          </p>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !description.trim() || !title.trim() || !location.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Report
            </button>
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
          {incidents.map(inc => {
            const next = incidentNextStatuses(inc.status);
            return (
              <li key={inc.id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{inc.incident_number}</span>
                  <strong style={{ color: 'var(--ink)' }}>{inc.title ?? HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</strong>
                  <span className="badge">{HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</span>
                  {inc.severity && inc.severity_confirmed_at ? (
                    <strong style={{ color: SEVERITY_COLOUR[inc.severity] }}>{HS_INCIDENT_SEVERITY_LABELS[inc.severity]}</strong>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      Severity unconfirmed{inc.severity ? ` (reported as ${HS_INCIDENT_SEVERITY_LABELS[inc.severity].toLowerCase()})` : ''}
                    </span>
                  )}
                  {inc.riddor_review_status !== 'not_reviewed' && (
                    <span className="badge flex items-center gap-1" style={{ background: 'rgba(217,68,68,0.12)', color: 'var(--red)' }}>
                      <AlertTriangle size={11} /> RIDDOR: {RIDDOR_REVIEW_STATUS_LABELS[inc.riddor_review_status as RiddorReviewStatus] ?? inc.riddor_review_status}
                    </span>
                  )}
                  <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(inc.occurred_on)}</span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{inc.description}</p>
                {inc.exact_location && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Location: {inc.exact_location}</p>}
                {inc.close_override_reason && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--gold)' }}>Closed with an override: {inc.close_override_reason}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span style={{ color: 'var(--ink-faint)' }}>Status: {HS_INCIDENT_STATUS_LABELS[inc.status]}</span>
                  {canRecord && inc.status !== 'closed' && inc.status !== 'archived' && (
                    <label className="flex items-center gap-1.5">
                      <span style={{ color: 'var(--ink-faint)' }}>Confirm severity</span>
                      <select className="input input-sm" value={inc.severity_confirmed_at ? (inc.severity ?? '') : ''}
                        onChange={e => e.target.value && update(inc, { severity: e.target.value }, 'Could not confirm the severity.')}>
                        <option value="">—</option>
                        {HS_INCIDENT_SEVERITIES.map(s => <option key={s} value={s}>{HS_INCIDENT_SEVERITY_LABELS[s]}</option>)}
                      </select>
                    </label>
                  )}
                  {canRecord && next.map(s => (
                    <button key={s} className="btn-secondary btn-sm" onClick={() => moveTo(inc, s)}>
                      {inc.status === 'closed' && s === 'triage' ? 'Reopen' : `Move to ${HS_INCIDENT_STATUS_LABELS[s].toLowerCase()}`}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
