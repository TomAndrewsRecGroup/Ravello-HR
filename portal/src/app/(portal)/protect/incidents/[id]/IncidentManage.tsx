'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  HS_INCIDENT_SEVERITIES, HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUS_LABELS, HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS,
  incidentNextStatuses, type HsIncidentSeverity, type HsIncidentStatus, type HsIncidentType,
} from '@/lib/hs/vocab';
import { INCIDENT_IMMEDIATE_ACTIONS, INCIDENT_IMMEDIATE_ACTION_LABELS } from '@/lib/hs/safetyVocab';
import type { IncidentRow, Option } from './types';

type Msg = { ok: boolean; text: string } | null;
const STALE = 'Someone else changed this incident since you opened it. Refresh to see their change.';

// Triage, severity confirmation, status moves and the incident's own
// details. Every save is conditional on the row_version the page was
// rendered with. The database (hs_incident_guard) decides who may do
// what and stamps who/when; this screen only offers what it would allow.
export default function IncidentManage({ incident, canInvestigate, canApprove, blockers, sites, departments, people, riskAssessments, assets }: {
  incident: IncidentRow; canInvestigate: boolean; canApprove: boolean; blockers: string | null;
  sites: { id: string; name: string }[]; departments: { id: string; name: string; site_id: string | null }[];
  people: Option[]; riskAssessments: Option[]; assets: Option[];
}) {
  const router = useRouter();
  const closed = incident.status === 'closed' || incident.status === 'archived';
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [target, setTarget] = useState<HsIncidentStatus | ''>('');
  const [override, setOverride] = useState('');
  const [severity, setSeverity] = useState<HsIncidentSeverity | ''>(incident.severity ?? '');
  const [d, setD] = useState({
    incident_type: incident.incident_type, title: incident.title ?? '', site_id: incident.site_id ?? '', department_id: incident.department_id ?? '',
    exact_location: incident.exact_location ?? '', activity_underway: incident.activity_underway ?? '',
    person_in_charge_id: incident.person_in_charge_id ?? '', linked_contractor_id: incident.linked_contractor_id ?? '',
    investigation_required: incident.investigation_required, linked_risk_assessment_id: incident.linked_risk_assessment_id ?? '',
    no_assessment_existed: incident.no_assessment_existed, linked_asset_id: incident.linked_asset_id ?? '',
    immediate_actions: incident.immediate_actions ?? [],
  });

  async function write(key: string, patch: Record<string, unknown>, ok: string) {
    setBusy(key); setMsg(null);
    const res = await createClient().from('hs_incidents').update(patch, COUNT_EXACT)
      .eq('id', incident.id).eq('row_version', incident.row_version);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The incident');
    if (!out.ok) { setMsg({ ok: false, text: res.count === 0 && !res.error ? STALE : out.message! }); return false; }
    setMsg({ ok: true, text: ok });
    router.refresh();
    return true;
  }

  const moves = incidentNextStatuses(incident.status).filter(s =>
    s === 'closed' || s === 'archived' || incident.status === 'closed' ? canApprove : canInvestigate);
  const closing = target === 'closed';
  const needsOverride = closing && !!blockers;

  async function move() {
    if (!target) return;
    const patch: Record<string, unknown> = { status: target };
    if (needsOverride) patch.close_override_reason = override.trim();
    if (await write('status', patch, `Moved to ${HS_INCIDENT_STATUS_LABELS[target]}.`)) { setTarget(''); setOverride(''); }
  }

  async function confirmSeverity() {
    // Sending a confirmation time makes the database stamp the person and
    // the moment, even when the value matches the reporter's estimate.
    await write('severity', { severity: severity || null, severity_confirmed_at: severity ? new Date().toISOString() : null },
      severity ? `Severity confirmed as ${HS_INCIDENT_SEVERITY_LABELS[severity]}.` : 'Severity cleared.');
  }

  async function saveDetails() {
    if (!d.title.trim()) { setMsg({ ok: false, text: 'Give the incident a short title.' }); return; }
    if (!d.site_id && !d.exact_location.trim()) { setMsg({ ok: false, text: 'Record a site or an exact location.' }); return; }
    await write('details', {
      incident_type: d.incident_type, title: d.title.trim(), site_id: d.site_id || null, department_id: d.department_id || null,
      exact_location: d.exact_location.trim() || null, activity_underway: d.activity_underway.trim() || null,
      person_in_charge_id: d.person_in_charge_id || null, linked_contractor_id: d.linked_contractor_id || null,
      investigation_required: d.investigation_required,
      linked_risk_assessment_id: d.no_assessment_existed ? null : d.linked_risk_assessment_id || null,
      no_assessment_existed: d.no_assessment_existed, linked_asset_id: d.linked_asset_id || null, immediate_actions: d.immediate_actions,
    }, 'Details saved.');
  }

  if (!canInvestigate && !canApprove) return null;
  return (
    <section className="card p-5 space-y-4 no-print">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Manage this incident</h2>

      {moves.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Move to</span>
              <select className="input" value={target} onChange={e => setTarget(e.target.value as HsIncidentStatus | '')}>
                <option value="">Choose…</option>
                {moves.map(s => <option key={s} value={s}>{incident.status === 'closed' && s === 'triage' ? 'Reopen (back to triage)' : HS_INCIDENT_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <button className="btn-cta btn-sm" onClick={move} disabled={!target || busy !== null || (needsOverride && override.trim().length < 10)}>
              {busy === 'status' && <Loader2 size={14} className="animate-spin" />} Change status
            </button>
          </div>
          {closing && !incident.severity_confirmed_at && (
            <p className="text-xs" style={{ color: 'var(--gold)' }}>A person must confirm the severity before the incident can be closed.</p>
          )}
          {closing && blockers && (
            <div className="rounded-[8px] p-3 space-y-2" style={{ background: 'rgba(217,68,68,0.08)' }}>
              <p className="text-sm" style={{ color: 'var(--red)' }}>This incident cannot be closed yet: {blockers}.</p>
              <label className="block"><span className="label">To close it anyway, record the reason for the override (at least 10 characters)</span>
                <textarea className="input" rows={2} value={override} onChange={e => setOverride(e.target.value)} maxLength={2000} /></label>
            </div>
          )}
        </div>
      )}

      {canInvestigate && !closed && (
        <div className="flex flex-wrap items-end gap-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <label className="block"><span className="label">Severity (a person&apos;s judgement — never inferred)</span>
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value as HsIncidentSeverity | '')}>
              <option value="">Not set</option>
              {HS_INCIDENT_SEVERITIES.map(s => <option key={s} value={s}>{HS_INCIDENT_SEVERITY_LABELS[s]}</option>)}
            </select>
          </label>
          <button className="btn-secondary btn-sm" onClick={confirmSeverity} disabled={busy !== null}>
            {busy === 'severity' && <Loader2 size={14} className="animate-spin" />} Confirm severity
          </button>
          {['major', 'critical', 'fatal'].includes(severity) && (
            <p className="text-xs w-full" style={{ color: 'var(--ink-faint)' }}>Corrective actions from a major, critical or fatal incident must be verified by someone other than the person who did the work.</p>
          )}
        </div>
      )}

      {canInvestigate && !closed && (
        <details style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>Edit details and links</summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
            <label className="block"><span className="label">Type</span>
              <select className="input" value={d.incident_type} onChange={e => setD({ ...d, incident_type: e.target.value as HsIncidentType })}>
                {HS_INCIDENT_TYPES.map(t => <option key={t} value={t}>{HS_INCIDENT_TYPE_LABELS[t]}</option>)}</select></label>
            <label className="block lg:col-span-2"><span className="label">Title</span>
              <input className="input" value={d.title} onChange={e => setD({ ...d, title: e.target.value })} maxLength={200} /></label>
            <label className="block"><span className="label">Site</span>
              <select className="input" value={d.site_id} onChange={e => setD({ ...d, site_id: e.target.value })}>
                <option value="">Not set</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="block"><span className="label">Department / area</span>
              <select className="input" value={d.department_id} onChange={e => setD({ ...d, department_id: e.target.value })}>
                <option value="">Not set</option>
                {departments.filter(x => !d.site_id || !x.site_id || x.site_id === d.site_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="block"><span className="label">Exact location</span>
              <input className="input" value={d.exact_location} onChange={e => setD({ ...d, exact_location: e.target.value })} maxLength={300} /></label>
            <label className="block"><span className="label">Person in charge</span>
              <select className="input" value={d.person_in_charge_id} onChange={e => setD({ ...d, person_in_charge_id: e.target.value })}>
                <option value="">Not set</option>{people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className="block"><span className="label">Contractor involved</span>
              <select className="input" value={d.linked_contractor_id} onChange={e => setD({ ...d, linked_contractor_id: e.target.value })}>
                <option value="">None</option>{people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className="block"><span className="label">Equipment / asset</span>
              <select className="input" value={d.linked_asset_id} onChange={e => setD({ ...d, linked_asset_id: e.target.value })}>
                <option value="">None</option>{assets.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            <label className="block lg:col-span-2"><span className="label">Risk assessment covering the work</span>
              <select className="input" value={d.linked_risk_assessment_id} disabled={d.no_assessment_existed}
                onChange={e => setD({ ...d, linked_risk_assessment_id: e.target.value })}>
                <option value="">Not linked</option>{riskAssessments.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm pt-5">
              <input type="checkbox" checked={d.no_assessment_existed} onChange={e => setD({ ...d, no_assessment_existed: e.target.checked })} />
              No risk assessment existed for this work</label>
            <label className="block sm:col-span-2 lg:col-span-3"><span className="label">Activity underway</span>
              <textarea className="input" rows={2} value={d.activity_underway} onChange={e => setD({ ...d, activity_underway: e.target.value })} maxLength={1000} /></label>
            <fieldset className="sm:col-span-2 lg:col-span-3">
              <legend className="label">Immediate actions taken</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {INCIDENT_IMMEDIATE_ACTIONS.map(a => (
                  <label key={a} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={d.immediate_actions.includes(a)} onChange={() => setD({ ...d,
                      immediate_actions: d.immediate_actions.includes(a) ? d.immediate_actions.filter(x => x !== a) : [...d.immediate_actions, a] })} />
                    {INCIDENT_IMMEDIATE_ACTION_LABELS[a]}</label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.investigation_required} onChange={e => setD({ ...d, investigation_required: e.target.checked })} />
              An investigation is required</label>
          </div>
          <button className="btn-cta btn-sm mt-3" onClick={saveDetails} disabled={busy !== null}>
            {busy === 'details' && <Loader2 size={14} className="animate-spin" />} Save details
          </button>
        </details>
      )}

      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </section>
  );
}
