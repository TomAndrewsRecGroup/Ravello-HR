'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadEvidence } from '@/lib/hs/evidence';
import { insertIncidentOnce } from '@/lib/hs/reportIncident';
import { HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS, type HsIncidentType } from '@/lib/hs/vocab';
import {
  BODY_PARTS, HOSPITAL_ATTENDANCE, HOSPITAL_ATTENDANCE_LABELS, INCIDENT_IMMEDIATE_ACTIONS, INCIDENT_IMMEDIATE_ACTION_LABELS,
  INCIDENT_PERSON_ROLES, INCIDENT_PERSON_ROLE_LABELS, INJURY_TYPES, TREATMENTS, TREATMENT_LABELS, humanise, incidentPath,
  type IncidentImmediateAction, type IncidentPersonRole,
} from '@/lib/hs/safetyVocab';

interface PersonDraft {
  key: number; personId: string; name: string; role: IncidentPersonRole; employer: string;
  bodyParts: string[]; injuryTypes: string[]; treatment: string; hospital: string;
}

const londonNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date());
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return { date: `${p('year')}-${p('month')}-${p('day')}`, time: `${p('hour')}:${p('minute')}` };
};

const BIG = { minHeight: 44 } as const;

// Incident / near-miss report — built for a phone, straight after the
// event (spec 65/67). Five things are required: what kind, when, where,
// a short title and what happened. Everything else is optional and can
// be added by the investigator later. The report saves the moment it is
// sent; the database gives it its number and records who reported it.
//
// Injury detail: the reporter may RECORD it here but cannot read it
// back afterwards (incident_person_sensitive is readable only with
// incident.sensitive.read) — writing is not seeing.
export default function IncidentReportForm({ companyId, sites, people, initialType }: {
  companyId: string; sites: { id: string; name: string }[]; people: { id: string; full_name: string }[]; initialType: HsIncidentType | '';
}) {
  const now = londonNow();
  const [type, setType] = useState<HsIncidentType | ''>(initialType);
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [siteId, setSiteId] = useState(sites.length === 1 ? sites[0].id : '');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [activity, setActivity] = useState('');
  const [immediate, setImmediate] = useState<IncidentImmediateAction[]>([]);
  const [immediateNote, setImmediateNote] = useState('');
  const [persons, setPersons] = useState<PersonDraft[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  // Fixed for the life of the form, so a retry after a lost reply finds
  // the report it already saved instead of filing a second one.
  const [reportId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; number: string; problems: string[] } | null>(null);

  const nearMiss = type === 'near_miss';
  const needLocation = !siteId && !location.trim();
  const ready = type && date && title.trim() && what.trim() && !needLocation;

  function addPerson() {
    setPersons(p => [...p, { key: Date.now(), personId: '', name: '', role: nearMiss ? 'affected_person' : 'injured_person', employer: '',
      bodyParts: [], injuryTypes: [], treatment: '', hospital: '' }]);
  }
  const setPerson = (key: number, patch: Partial<PersonDraft>) => setPersons(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError(null);
    const sb = createClient();
    const { data, error: err } = await insertIncidentOnce(sb, reportId, {
      company_id: companyId, incident_type: type, title: title.trim(), description: what.trim(),
      occurred_on: date, incident_time: time || null, site_id: siteId || null, exact_location: location.trim() || null,
      activity_underway: activity.trim() || null, immediate_actions: immediate, immediate_action: immediateNote.trim() || null,
    });
    if (err || !data) { setBusy(false); setError(err ?? 'The report was not saved. Please try again.'); return; }

    // The report exists from here on. Anything below that fails is
    // listed on the confirmation, never allowed to lose the report.
    const problems: string[] = [];
    for (const p of persons) {
      if (!p.personId && !p.name.trim()) continue;
      const { data: ip, error: pErr } = await sb.from('incident_people').insert({
        company_id: companyId, incident_id: data.id, person_id: p.personId || null,
        external_name: p.personId ? null : p.name.trim(), role_in_incident: p.role, employer: p.employer.trim() || null,
      }).select('id').single();
      if (pErr || !ip) { problems.push(`A person was not added: ${pErr?.message ?? 'unknown error'}`); continue; }
      const injury = p.bodyParts.length || p.injuryTypes.length || p.treatment || p.hospital;
      if (injury) {
        // No .select(): the reporter is not allowed to read this back.
        const { error: sErr } = await sb.from('incident_person_sensitive').insert({
          incident_person_id: ip.id, company_id: companyId, body_parts: p.bodyParts, injury_types: p.injuryTypes,
          treatment: p.treatment || null, hospital_attendance: p.hospital || null,
          first_aid_given: p.treatment === 'first_aid_only' ? true : null,
        });
        if (sErr) problems.push(`Injury detail was not recorded: ${sErr.message}`);
      }
    }
    for (const file of photos) {
      const pr = await uploadEvidence(sb, { companyId, entityType: 'incident', entityId: data.id, file, evidenceType: 'photo' });
      if (pr) problems.push(pr);
    }
    setBusy(false);
    setDone({ id: data.id, number: data.incident_number, problems });
  }

  if (done) {
    return (
      <div className="card p-6 max-w-xl space-y-3">
        <p className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--teal)' }}>
          <CheckCircle2 size={22} /> {nearMiss ? 'Near miss' : 'Incident'} {done.number} reported
        </p>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Thank you. Your report is saved and the H&amp;S team has been told. Quote <strong className="font-mono">{done.number}</strong> if anyone asks about it.
        </p>
        {done.problems.map((p, i) => <p key={i} className="text-sm" style={{ color: 'var(--red)' }}>{p}</p>)}
        <div className="flex flex-wrap gap-2">
          <Link href={incidentPath(done.id)} className="btn-secondary" style={BIG}>View the report</Link>
          <Link href="/protect/incidents" className="btn-ghost" style={BIG}>Back to incidents</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-4 sm:p-6 max-w-xl space-y-4">
      <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>{nearMiss ? 'Report a near miss' : 'Report an incident'}</h2>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>If anyone is hurt or in danger, get help first. Only the first five questions are needed now.</p>

      <label className="block">
        <span className="label">What kind of event?</span>
        <select className="input" style={BIG} value={type} onChange={e => setType(e.target.value as HsIncidentType)} required>
          <option value="">Choose…</option>
          {HS_INCIDENT_TYPES.map(t => <option key={t} value={t}>{HS_INCIDENT_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <div className="grid gap-4 grid-cols-2">
        <label className="block"><span className="label">Date</span>
          <input className="input" style={BIG} type="date" suppressHydrationWarning value={date} max={now.date} onChange={e => setDate(e.target.value)} required /></label>
        <label className="block"><span className="label">Time (approx.)</span>
          <input className="input" style={BIG} type="time" suppressHydrationWarning value={time} onChange={e => setTime(e.target.value)} /></label>
      </div>
      {sites.length > 0 && (
        <label className="block"><span className="label">Site</span>
          <select className="input" style={BIG} value={siteId} onChange={e => setSiteId(e.target.value)}>
            <option value="">Not listed / other location</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Exact location{siteId ? ' (optional)' : ''}</span>
        <input className="input" style={BIG} value={location} onChange={e => setLocation(e.target.value)} maxLength={300}
          placeholder="e.g. Warehouse, loading bay 2" required={!siteId} />
      </label>
      <label className="block">
        <span className="label">Short title</span>
        <input className="input" style={BIG} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
          placeholder={nearMiss ? 'e.g. Pallet fell from racking, nobody hurt' : 'e.g. Slip on wet floor in canteen'} />
      </label>
      <label className="block">
        <span className="label">What happened?</span>
        <textarea className="input" rows={4} value={what} onChange={e => setWhat(e.target.value)} maxLength={4000} required />
      </label>

      <details className="space-y-3" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--ink-soft)', minHeight: 32 }}>Add more detail (optional)</summary>
        <label className="block"><span className="label">What work was going on?</span>
          <textarea className="input" rows={2} value={activity} onChange={e => setActivity(e.target.value)} maxLength={1000} /></label>
        <fieldset>
          <legend className="label">What was done straight away?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {INCIDENT_IMMEDIATE_ACTIONS.map(a => (
              <label key={a} className="flex items-center gap-2 text-sm" style={{ minHeight: 40 }}>
                <input type="checkbox" className="h-5 w-5" checked={immediate.includes(a)}
                  onChange={() => setImmediate(v => toggle(v, a) as IncidentImmediateAction[])} />
                {INCIDENT_IMMEDIATE_ACTION_LABELS[a]}
              </label>
            ))}
          </div>
          <input className="input mt-2" style={BIG} value={immediateNote} onChange={e => setImmediateNote(e.target.value)} maxLength={2000}
            placeholder="Anything else done (optional)" />
        </fieldset>

        <div className="space-y-3">
          <p className="label">People involved</p>
          {persons.map(p => (
            <div key={p.key} className="rounded-[8px] p-3 space-y-2" style={{ border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block"><span className="label">Role in the incident</span>
                  <select className="input" style={BIG} value={p.role} onChange={e => setPerson(p.key, { role: e.target.value as IncidentPersonRole })}>
                    {INCIDENT_PERSON_ROLES.map(r => <option key={r} value={r}>{INCIDENT_PERSON_ROLE_LABELS[r]}</option>)}
                  </select></label>
                {people.length > 0 && (
                  <label className="block"><span className="label">Person</span>
                    <select className="input" style={BIG} value={p.personId} onChange={e => setPerson(p.key, { personId: e.target.value })}>
                      <option value="">Not listed — type a name</option>
                      {people.map(x => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                    </select></label>
                )}
                {!p.personId && (
                  <label className="block"><span className="label">Name</span>
                    <input className="input" style={BIG} value={p.name} onChange={e => setPerson(p.key, { name: e.target.value })} maxLength={200} /></label>
                )}
                <label className="block"><span className="label">Employer (if not us)</span>
                  <input className="input" style={BIG} value={p.employer} onChange={e => setPerson(p.key, { employer: e.target.value })} maxLength={200} /></label>
              </div>
              {p.role === 'injured_person' && (
                <details>
                  <summary className="cursor-pointer text-sm" style={{ color: 'var(--ink-soft)', minHeight: 32 }}>Injury detail (optional — kept confidential)</summary>
                  <p className="text-xs my-1" style={{ color: 'var(--ink-faint)' }}>Only people authorised to see medical information can read this. You will not be able to see it after sending.</p>
                  <p className="label mt-2">Body part</p>
                  <div className="flex flex-wrap gap-1">
                    {BODY_PARTS.map(b => (
                      <label key={b} className="badge cursor-pointer" style={{ minHeight: 32, background: p.bodyParts.includes(b) ? 'var(--surface-alt)' : 'var(--surface)', border: '1px solid var(--line)' }}>
                        <input type="checkbox" className="sr-only" checked={p.bodyParts.includes(b)} onChange={() => setPerson(p.key, { bodyParts: toggle(p.bodyParts, b) })} />
                        {p.bodyParts.includes(b) ? '✓ ' : ''}{humanise(b)}
                      </label>
                    ))}
                  </div>
                  <p className="label mt-2">Type of injury</p>
                  <div className="flex flex-wrap gap-1">
                    {INJURY_TYPES.map(b => (
                      <label key={b} className="badge cursor-pointer" style={{ minHeight: 32, background: p.injuryTypes.includes(b) ? 'var(--surface-alt)' : 'var(--surface)', border: '1px solid var(--line)' }}>
                        <input type="checkbox" className="sr-only" checked={p.injuryTypes.includes(b)} onChange={() => setPerson(p.key, { injuryTypes: toggle(p.injuryTypes, b) })} />
                        {p.injuryTypes.includes(b) ? '✓ ' : ''}{humanise(b)}
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 mt-2">
                    <label className="block"><span className="label">Treatment</span>
                      <select className="input" style={BIG} value={p.treatment} onChange={e => setPerson(p.key, { treatment: e.target.value })}>
                        <option value="">Not known</option>
                        {TREATMENTS.map(t => <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>)}
                      </select></label>
                    <label className="block"><span className="label">Hospital</span>
                      <select className="input" style={BIG} value={p.hospital} onChange={e => setPerson(p.key, { hospital: e.target.value })}>
                        <option value="">Not known</option>
                        {HOSPITAL_ATTENDANCE.map(t => <option key={t} value={t}>{HOSPITAL_ATTENDANCE_LABELS[t]}</option>)}
                      </select></label>
                  </div>
                </details>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPersons(ps => ps.filter(x => x.key !== p.key))}><Trash2 size={14} /> Remove</button>
            </div>
          ))}
          <button type="button" className="btn-secondary btn-sm" style={BIG} onClick={addPerson}><Plus size={14} /> Add a person</button>
        </div>
      </details>

      <label className="btn-secondary cursor-pointer w-full justify-center" style={{ minHeight: 48 }}>
        <Camera size={16} /> {photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} added — add more` : 'Add photos (optional)'}
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
          onChange={e => { const l = e.target.files; if (l) setPhotos(p => [...p, ...Array.from(l)]); e.target.value = ''; }} />
      </label>
      {photos.length > 0 && (
        <ul className="text-xs space-y-1" style={{ color: 'var(--ink-soft)' }}>
          {photos.map((ph, i) => (
            <li key={i} className="flex items-center gap-2">{ph.name}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}>Remove</button></li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <button className="btn-cta w-full justify-center" style={{ minHeight: 48 }} disabled={busy || !ready}>
        {busy && <Loader2 size={16} className="animate-spin" />} Send report
      </button>
    </form>
  );
}
