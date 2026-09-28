'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  BODY_PARTS, HOSPITAL_ATTENDANCE, HOSPITAL_ATTENDANCE_LABELS, INCIDENT_PERSON_ROLES, INCIDENT_PERSON_ROLE_LABELS, INJURY_TYPES,
  TREATMENTS, TREATMENT_LABELS, humanise, type IncidentPersonRole,
} from '@/lib/hs/safetyVocab';
import type { IncidentPersonRow, Option, SensitiveRow } from './types';

// The people in an incident (incident_people) and — only for someone
// holding incident.sensitive.read — their injury, treatment and contact
// record (incident_person_sensitive). The page never fetches the
// sensitive rows for anyone else, so nothing here can leak them.
export default function IncidentPeople({ companyId, incidentId, rows, sensitive, people, canEdit, canSensitive, open }: {
  companyId: string; incidentId: string; rows: IncidentPersonRow[]; sensitive: SensitiveRow[] | null; people: Option[];
  canEdit: boolean; canSensitive: boolean; open: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ person_id: '', external_name: '', role: 'witness' as IncidentPersonRole, employer: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const personName = (r: IncidentPersonRow) => (r.person_id ? people.find(p => p.id === r.person_id)?.label ?? 'A person on record' : r.external_name ?? '—');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!np.person_id && !np.external_name.trim()) return;
    setBusy('add'); setErr(null);
    const { error } = await createClient().from('incident_people').insert({
      company_id: companyId, incident_id: incidentId, person_id: np.person_id || null,
      external_name: np.person_id ? null : np.external_name.trim(), role_in_incident: np.role, employer: np.employer.trim() || null,
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setAdding(false); setNp({ person_id: '', external_name: '', role: 'witness', employer: '' });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Remove this person from the incident? Any injury record for them is removed too.')) return;
    setBusy(id); setErr(null);
    const { error, count } = await createClient().from('incident_people').delete(COUNT_EXACT).eq('id', id);
    setBusy(null);
    const out = judgeWrite({ error, count }, 'The removal');
    if (!out.ok) { setErr(out.message); return; }
    router.refresh();
  }

  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>People involved</h2>
      {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nobody has been recorded against this incident yet.</p> : (
        <ul className="space-y-2">
          {rows.map(r => {
            const s = sensitive?.find(x => x.incident_person_id === r.id) ?? null;
            return (
              <li key={r.id} className="rounded-[8px] p-3 space-y-2" style={{ border: '1px solid var(--line)' }}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong style={{ color: 'var(--ink)' }}>{personName(r)}</strong>
                  <span className="badge">{INCIDENT_PERSON_ROLE_LABELS[r.role_in_incident as IncidentPersonRole] ?? humanise(r.role_in_incident)}</span>
                  {r.employer && <span style={{ color: 'var(--ink-faint)' }}>Employer: {r.employer}</span>}
                  <span className="ml-auto flex gap-2 no-print">
                    {canSensitive && open && (
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(editing === r.id ? null : r.id)}>
                        <Lock size={13} /> {s ? 'Edit injury record' : 'Add injury record'}</button>
                    )}
                    {canEdit && <button className="btn-ghost btn-sm" onClick={() => remove(r.id)} disabled={busy === r.id}><Trash2 size={13} /> Remove</button>}
                  </span>
                </div>
                {canSensitive && s && editing !== r.id && <SensitiveView s={s} />}
                {canSensitive && editing === r.id && (
                  <SensitiveForm companyId={companyId} personRowId={r.id} existing={s} onDone={() => { setEditing(null); router.refresh(); }} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!canSensitive && rows.length > 0 && (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}><Lock size={12} /> Injury, treatment and contact details are restricted to people authorised to see medical information.</p>
      )}
      {canEdit && open && (adding ? (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end no-print">
          <label className="block"><span className="label">Role</span>
            <select className="input" value={np.role} onChange={e => setNp({ ...np, role: e.target.value as IncidentPersonRole })}>
              {INCIDENT_PERSON_ROLES.map(x => <option key={x} value={x}>{INCIDENT_PERSON_ROLE_LABELS[x]}</option>)}</select></label>
          <label className="block"><span className="label">Person on record</span>
            <select className="input" value={np.person_id} onChange={e => setNp({ ...np, person_id: e.target.value })}>
              <option value="">Not listed — type a name</option>{people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          {!np.person_id && (
            <label className="block"><span className="label">Name</span>
              <input className="input" value={np.external_name} onChange={e => setNp({ ...np, external_name: e.target.value })} maxLength={200} /></label>
          )}
          <label className="block"><span className="label">Employer</span>
            <input className="input" value={np.employer} onChange={e => setNp({ ...np, employer: e.target.value })} maxLength={200} /></label>
          <div className="flex gap-2">
            <button className="btn-cta btn-sm" disabled={busy === 'add' || (!np.person_id && !np.external_name.trim())}>{busy === 'add' && <Loader2 size={14} className="animate-spin" />} Add</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : <button className="btn-secondary btn-sm no-print" onClick={() => setAdding(true)}><Plus size={14} /> Add a person</button>)}
      {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
    </section>
  );
}

function SensitiveView({ s }: { s: SensitiveRow }) {
  const item = (label: string, v: React.ReactNode) => (v === null || v === undefined || v === '' ? null : (
    <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{label}</dt><dd>{v}</dd></div>
  ));
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3 rounded-[6px] p-2" style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>
      {item('Body parts', s.body_parts.map(humanise).join(', '))}
      {item('Injury types', s.injury_types.map(humanise).join(', '))}
      {item('Treatment', s.treatment ? TREATMENT_LABELS[s.treatment as keyof typeof TREATMENT_LABELS] : null)}
      {item('First aid given', s.first_aid_given == null ? null : s.first_aid_given ? 'Yes' : 'No')}
      {item('Hospital', s.hospital_attendance ? HOSPITAL_ATTENDANCE_LABELS[s.hospital_attendance as keyof typeof HOSPITAL_ATTENDANCE_LABELS] : null)}
      {item('Time lost', s.time_lost == null ? null : s.time_lost ? `Yes${s.days_lost != null ? ` — ${s.days_lost} day(s)` : ''}` : 'No')}
      {item('Work restriction', s.work_restriction)}
      {item('Return date', s.return_date)}
      {item('Phone', s.contact_phone)}
      {item('Email', s.contact_email)}
      {item('Address', s.contact_address)}
      {item('Notes', s.notes)}
    </dl>
  );
}

function SensitiveForm({ companyId, personRowId, existing, onDone }: {
  companyId: string; personRowId: string; existing: SensitiveRow | null; onDone: () => void;
}) {
  const [f, setF] = useState({
    body_parts: existing?.body_parts ?? [], injury_types: existing?.injury_types ?? [], treatment: existing?.treatment ?? '',
    first_aid_given: existing?.first_aid_given ?? null, hospital_attendance: existing?.hospital_attendance ?? '',
    time_lost: existing?.time_lost ?? null, days_lost: existing?.days_lost?.toString() ?? '', work_restriction: existing?.work_restriction ?? '',
    return_date: existing?.return_date ?? '', contact_phone: existing?.contact_phone ?? '', contact_email: existing?.contact_email ?? '',
    contact_address: existing?.contact_address ?? '', notes: existing?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (k: 'body_parts' | 'injury_types', v: string) =>
    setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));
  const yn = (v: boolean | null) => (v == null ? '' : v ? 'yes' : 'no');
  const fromYn = (v: string) => (v === '' ? null : v === 'yes');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const days = f.days_lost.trim() === '' ? null : Number(f.days_lost);
    const payload = {
      body_parts: f.body_parts, injury_types: f.injury_types, treatment: f.treatment || null, first_aid_given: f.first_aid_given,
      hospital_attendance: f.hospital_attendance || null, time_lost: f.time_lost, days_lost: Number.isFinite(days) ? days : null,
      work_restriction: f.work_restriction.trim() || null, return_date: f.return_date || null, contact_phone: f.contact_phone.trim() || null,
      contact_email: f.contact_email.trim() || null, contact_address: f.contact_address.trim() || null, notes: f.notes.trim() || null,
    };
    const sb = createClient();
    let message: string | null = null;
    if (existing) {
      const res = await sb.from('incident_person_sensitive').update(payload, COUNT_EXACT).eq('incident_person_id', personRowId);
      message = judgeWrite({ error: res.error, count: res.count }, 'The injury record').message;
    } else {
      const { error } = await sb.from('incident_person_sensitive').insert({ ...payload, incident_person_id: personRowId, company_id: companyId });
      message = error?.message ?? null;
    }
    setBusy(false);
    if (message) { setErr(message); return; }
    onDone();
  }

  const chips = (k: 'body_parts' | 'injury_types', list: readonly string[]) => (
    <div className="flex flex-wrap gap-1">
      {list.map(v => (
        <label key={v} className="badge cursor-pointer" style={{ background: f[k].includes(v) ? 'var(--surface-alt)' : 'var(--surface)', border: '1px solid var(--line)' }}>
          <input type="checkbox" className="sr-only" checked={f[k].includes(v)} onChange={() => toggle(k, v)} />{f[k].includes(v) ? '✓ ' : ''}{humanise(v)}
        </label>
      ))}
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-3 rounded-[6px] p-3 no-print" style={{ background: 'var(--surface-soft)' }}>
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}><Lock size={12} /> Confidential medical information. Record only what is needed.</p>
      <div><p className="label">Body parts</p>{chips('body_parts', BODY_PARTS)}</div>
      <div><p className="label">Injury types</p>{chips('injury_types', INJURY_TYPES)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className="label">Treatment</span>
          <select className="input" value={f.treatment} onChange={e => setF({ ...f, treatment: e.target.value })}>
            <option value="">Not known</option>{TREATMENTS.map(t => <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>)}</select></label>
        <label className="block"><span className="label">First aid given</span>
          <select className="input" value={yn(f.first_aid_given)} onChange={e => setF({ ...f, first_aid_given: fromYn(e.target.value) })}>
            <option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className="block"><span className="label">Hospital</span>
          <select className="input" value={f.hospital_attendance} onChange={e => setF({ ...f, hospital_attendance: e.target.value })}>
            <option value="">Not known</option>{HOSPITAL_ATTENDANCE.map(t => <option key={t} value={t}>{HOSPITAL_ATTENDANCE_LABELS[t]}</option>)}</select></label>
        <label className="block"><span className="label">Time lost</span>
          <select className="input" value={yn(f.time_lost)} onChange={e => setF({ ...f, time_lost: fromYn(e.target.value) })}>
            <option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className="block"><span className="label">Days lost</span>
          <input className="input" type="number" min={0} max={3650} value={f.days_lost} onChange={e => setF({ ...f, days_lost: e.target.value })} /></label>
        <label className="block"><span className="label">Return date</span>
          <input className="input" type="date" value={f.return_date} onChange={e => setF({ ...f, return_date: e.target.value })} /></label>
        <label className="block"><span className="label">Phone</span>
          <input className="input" value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} maxLength={60} /></label>
        <label className="block"><span className="label">Email</span>
          <input className="input" type="email" value={f.contact_email} onChange={e => setF({ ...f, contact_email: e.target.value })} maxLength={320} /></label>
      </div>
      <label className="block"><span className="label">Work restriction</span>
        <input className="input" value={f.work_restriction} onChange={e => setF({ ...f, work_restriction: e.target.value })} maxLength={1000} /></label>
      <label className="block"><span className="label">Address</span>
        <input className="input" value={f.contact_address} onChange={e => setF({ ...f, contact_address: e.target.value })} maxLength={500} /></label>
      <label className="block"><span className="label">Notes</span>
        <textarea className="input" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={4000} /></label>
      {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
      <div className="flex gap-2">
        <button className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save injury record</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
