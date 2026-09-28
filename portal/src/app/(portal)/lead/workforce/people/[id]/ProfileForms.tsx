'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { uploadWorkforceEvidence, type WorkforceEvidenceKind } from '@/lib/workforce/evidence';
import { HS_EVIDENCE_ACCEPT } from '@/lib/hs/evidence';
import { todayIso } from '@/lib/hs/safetyFormat';
import { suggestExpiry } from '@/lib/workforce/profile';
import {
  ASSESSMENT_METHODS, ASSESSMENT_METHOD_LABELS, ASSIGNMENT_STATUSES, CREDENTIAL_KINDS, REQUIREMENT_TYPE_LABELS,
  TRAINING_RESULTS, type AssessmentMethod, type AssignmentStatus,
} from '@/lib/workforce/vocab';
import type {
  AuthTypeOption, CompetencyOption, CourseOption, CredentialTypeOption, DepartmentOption, LevelOption, Option, RoleOption, SiteOption,
} from './rows';

// The profile's recording forms. Each writes under the viewer's own
// session: RLS and the 132/134 guards decide, fill company_id from the
// person and stamp who recorded it. Evidence is uploaded FIRST, then the
// record that names it is written (the storage read policy follows the
// record). A refused write shows the database's own message.

type Msg = { ok: boolean; text: string } | null;
type Tr = typeof TRAINING_RESULTS[number];
const RESULT_LABELS: Record<Tr, string> = { pass: 'Passed', fail: 'Failed', attended: 'Attended (not assessed)' };
const planned: AssignmentStatus = ASSIGNMENT_STATUSES[0];
const active: AssignmentStatus = ASSIGNMENT_STATUSES[1];
const ended: AssignmentStatus = ASSIGNMENT_STATUSES[2];

function Shell({ title, open, setOpen, children, note }: {
  title: string; open: boolean; setOpen: (b: boolean) => void; children: React.ReactNode; note?: string;
}) {
  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setOpen(true)}>
        <Plus size={14} /> {title}
      </button>
    );
  }
  return (
    <div className="card p-4 space-y-3 no-print" style={{ background: 'var(--surface-soft)' }}>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h3>
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setOpen(false)}>Close</button>
      </div>
      {note && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{note}</p>}
      {children}
    </div>
  );
}

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p role={msg.ok ? 'status' : 'alert'} className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>;
}

function Submit({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" className="btn-cta btn-sm" disabled={busy}>
      {busy && <Loader2 size={14} className="animate-spin" />} {label}
    </button>
  );
}

function EvidenceInput({ onChange }: { onChange: (f: File | null) => void }) {
  return (
    <label className="block"><span className="label">Evidence file (optional)</span>
      <input type="file" className="input" accept={HS_EVIDENCE_ACCEPT.join(',')} onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/** Upload first; returns the key, null when there is no file, or an error. */
async function maybeUpload(file: File | null, companyId: string, kind: WorkforceEvidenceKind, personId: string):
  Promise<{ key: string | null; error: string | null }> {
  if (!file) return { key: null, error: null };
  const up = await uploadWorkforceEvidence(createClient(), { companyId, kind, personId, file });
  return up.error ? { key: null, error: up.error } : { key: up.key, error: null };
}

const grid = 'grid gap-3 sm:grid-cols-2';

// ─── Training ───────────────────────────────────────────────────────

export function RecordTrainingForm({ companyId, personId, courses }: { companyId: string; personId: string; courses: CourseOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ course_id: '', completed_on: todayIso(), result: 'pass' as Tr, provider: '', certificate_number: '', expires_on: '' });
  const [file, setFile] = useState<File | null>(null);
  const course = courses.find(c => c.id === f.course_id);

  function pick(courseId: string) {
    const c = courses.find(x => x.id === courseId);
    setF(p => ({ ...p, course_id: courseId, expires_on: suggestExpiry(p.completed_on, c?.validity_months) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!course) { setMsg({ ok: false, text: 'Choose the course.' }); return; }
    setBusy(true); setMsg(null);
    const up = await maybeUpload(file, companyId, 'training', personId);
    if (up.error) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
    const { error } = await createClient().from('training_records').insert({
      company_id: companyId, person_id: personId, course_id: course.id, course_name: course.title,
      completed_on: f.completed_on, result: f.result, provider: f.provider.trim() || null,
      certificate_number: f.certificate_number.trim() || null, expires_on: f.expires_on || null,
      evidence_path: up.key, source: 'manual',
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Training recorded. It is awaiting verification.' });
    setF(p => ({ ...p, course_id: '', provider: '', certificate_number: '', expires_on: '' })); setFile(null);
    router.refresh();
  }

  return (
    <Shell title="Record training" open={open} setOpen={setOpen}
      note="The record starts unverified. Training on its own never makes someone competent — competence needs a verified assessment.">
      {courses.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active courses in the catalogue. Add the course to the training catalogue first.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className={grid}>
            <label className="block"><span className="label">Course</span>
              <select className="input" required value={f.course_id} onChange={e => pick(e.target.value)}>
                <option value="">Choose…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}{c.safety_critical ? ' (safety-critical)' : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Completed on</span>
              <input type="date" className="input" required max={todayIso()} value={f.completed_on}
                onChange={e => setF(p => ({ ...p, completed_on: e.target.value, expires_on: suggestExpiry(e.target.value, course?.validity_months) }))} />
            </label>
            <label className="block"><span className="label">Result</span>
              <select className="input" value={f.result} onChange={e => setF(p => ({ ...p, result: e.target.value as Tr }))}>
                {TRAINING_RESULTS.map(r => <option key={r} value={r}>{RESULT_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Provider (optional)</span>
              <input className="input" maxLength={200} value={f.provider} onChange={e => setF(p => ({ ...p, provider: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Certificate number (optional)</span>
              <input className="input" maxLength={120} value={f.certificate_number} onChange={e => setF(p => ({ ...p, certificate_number: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Expires on (optional)</span>
              <input type="date" className="input" min={f.completed_on} value={f.expires_on} onChange={e => setF(p => ({ ...p, expires_on: e.target.value }))} />
              {course?.validity_months ? <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Suggested from the course’s {course.validity_months}-month validity. Change it if the certificate says otherwise.</span> : null}
            </label>
            <EvidenceInput onChange={setFile} />
          </div>
          <Submit busy={busy} label="Record training" />
        </form>
      )}
      <Feedback msg={msg} />
    </Shell>
  );
}

// ─── Competency ─────────────────────────────────────────────────────

export function RecordCompetencyForm({ companyId, personId, competencies, levels }: {
  companyId: string; personId: string; competencies: CompetencyOption[]; levels: LevelOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ competency_id: '', level_id: '', assessment_method: 'practical_observation' as AssessmentMethod,
    assessed_on: todayIso(), assessor_name: '', expires_on: '' });
  const [file, setFile] = useState<File | null>(null);
  const comp = competencies.find(c => c.id === f.competency_id);

  function pick(id: string) {
    const c = competencies.find(x => x.id === id);
    setF(p => ({ ...p, competency_id: id,
      assessment_method: (ASSESSMENT_METHODS as readonly string[]).includes(c?.assessment_method ?? '') ? c!.assessment_method as AssessmentMethod : p.assessment_method,
      expires_on: suggestExpiry(p.assessed_on, c?.renewal_months) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!comp || !f.level_id) { setMsg({ ok: false, text: 'Choose the competency and the level assessed.' }); return; }
    setBusy(true); setMsg(null);
    const up = await maybeUpload(file, companyId, 'competency', personId);
    if (up.error) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
    const { error } = await createClient().from('person_competencies').insert({
      company_id: companyId, person_id: personId, competency_id: comp.id, level_id: f.level_id,
      assessment_method: f.assessment_method, assessed_on: f.assessed_on, assessor_name: f.assessor_name.trim() || null,
      expires_on: f.expires_on || null, evidence_path: up.key,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Assessment recorded. It is unverified and does not count until someone with competency verification verifies it.' });
    setF(p => ({ ...p, competency_id: '', level_id: '', assessor_name: '', expires_on: '' })); setFile(null);
    router.refresh();
  }

  return (
    <Shell title="Record a competency assessment" open={open} setOpen={setOpen}
      note="An assessment starts unverified and counts toward Safe to Deploy only once it has been verified. It is never edited: a new assessment is a new record.">
      {competencies.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active competencies in the catalogue yet.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className={grid}>
            <label className="block"><span className="label">Competency</span>
              <select className="input" required value={f.competency_id} onChange={e => pick(e.target.value)}>
                <option value="">Choose…</option>
                {competencies.map(c => <option key={c.id} value={c.id}>{c.title}{c.safety_critical ? ' (safety-critical)' : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Level assessed</span>
              <select className="input" required value={f.level_id} onChange={e => setF(p => ({ ...p, level_id: e.target.value }))}>
                <option value="">Choose…</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">How it was assessed</span>
              <select className="input" value={f.assessment_method} onChange={e => setF(p => ({ ...p, assessment_method: e.target.value as AssessmentMethod }))}>
                {ASSESSMENT_METHODS.map(m => <option key={m} value={m}>{ASSESSMENT_METHOD_LABELS[m]}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Assessed on</span>
              <input type="date" className="input" required max={todayIso()} value={f.assessed_on}
                onChange={e => setF(p => ({ ...p, assessed_on: e.target.value, expires_on: suggestExpiry(e.target.value, comp?.renewal_months) }))} />
            </label>
            <label className="block"><span className="label">Assessor name (optional)</span>
              <input className="input" maxLength={200} value={f.assessor_name} onChange={e => setF(p => ({ ...p, assessor_name: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Expires on (optional)</span>
              <input type="date" className="input" min={f.assessed_on} value={f.expires_on} onChange={e => setF(p => ({ ...p, expires_on: e.target.value }))} />
            </label>
            <EvidenceInput onChange={setFile} />
          </div>
          <Submit busy={busy} label="Record assessment" />
        </form>
      )}
      <Feedback msg={msg} />
    </Shell>
  );
}

// ─── Credentials (qualifications, certificates, licences, cards, permits) ─

export function AddCredentialForm({ companyId, personId, types }: { companyId: string; personId: string; types: CredentialTypeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ credential_type_id: '', credential_number: '', awarding_body: '', issued_on: '', expires_on: '' });
  const [file, setFile] = useState<File | null>(null);
  const t = types.find(x => x.id === f.credential_type_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!t) { setMsg({ ok: false, text: 'Choose the type.' }); return; }
    setBusy(true); setMsg(null);
    const up = await maybeUpload(file, companyId, 'credential', personId);
    if (up.error) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
    const { error } = await createClient().from('person_credentials').insert({
      company_id: companyId, person_id: personId, credential_type_id: t.id,
      credential_number: f.credential_number.trim() || null, awarding_body: f.awarding_body.trim() || null,
      issued_on: f.issued_on || null, expires_on: f.expires_on || null, evidence_path: up.key, source: 'manual',
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Added. It is awaiting verification.' });
    setF({ credential_type_id: '', credential_number: '', awarding_body: '', issued_on: '', expires_on: '' }); setFile(null);
    router.refresh();
  }

  return (
    <Shell title="Add a qualification or licence" open={open} setOpen={setOpen} note="It starts unverified.">
      {types.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active qualification, certificate, licence, card or permit types in the catalogue yet.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className={grid}>
            <label className="block"><span className="label">Type</span>
              <select className="input" required value={f.credential_type_id}
                onChange={e => { const x = types.find(y => y.id === e.target.value); setF(p => ({ ...p, credential_type_id: e.target.value, awarding_body: x?.awarding_body ?? p.awarding_body, expires_on: suggestExpiry(p.issued_on, x?.validity_months) })); }}>
                <option value="">Choose…</option>
                {CREDENTIAL_KINDS.map(k => {
                  const list = types.filter(x => x.kind === k);
                  return list.length ? (
                    <optgroup key={k} label={REQUIREMENT_TYPE_LABELS[k]}>
                      {list.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <label className="block"><span className="label">Number (optional)</span>
              <input className="input" maxLength={120} value={f.credential_number} onChange={e => setF(p => ({ ...p, credential_number: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Awarding body (optional)</span>
              <input className="input" maxLength={200} value={f.awarding_body} onChange={e => setF(p => ({ ...p, awarding_body: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Issued on (optional)</span>
              <input type="date" className="input" max={todayIso()} value={f.issued_on}
                onChange={e => setF(p => ({ ...p, issued_on: e.target.value, expires_on: suggestExpiry(e.target.value, t?.validity_months) }))} />
            </label>
            <label className="block"><span className="label">Expires on (optional)</span>
              <input type="date" className="input" min={f.issued_on || undefined} value={f.expires_on} onChange={e => setF(p => ({ ...p, expires_on: e.target.value }))} />
            </label>
            <EvidenceInput onChange={setFile} />
          </div>
          <Submit busy={busy} label="Add" />
        </form>
      )}
      <Feedback msg={msg} />
    </Shell>
  );
}

// ─── Authorisations ─────────────────────────────────────────────────

export function IssueAuthorisationForm({ companyId, personId, types, sites }: {
  companyId: string; personId: string; types: AuthTypeOption[]; sites: SiteOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ authorisation_type_id: '', scope_site_id: '', scope_detail: '', issuing_authority: '', issued_on: todayIso(), expires_on: '' });
  const [file, setFile] = useState<File | null>(null);
  const t = types.find(x => x.id === f.authorisation_type_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!t) { setMsg({ ok: false, text: 'Choose the authorisation.' }); return; }
    setBusy(true); setMsg(null);
    const up = await maybeUpload(file, companyId, 'authorisation', personId);
    if (up.error) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
    const { error } = await createClient().from('person_authorisations').insert({
      company_id: companyId, person_id: personId, authorisation_type_id: t.id, scope_site_id: f.scope_site_id || null,
      scope_detail: f.scope_detail.trim() || null, issuing_authority: f.issuing_authority.trim() || null,
      issued_on: f.issued_on, expires_on: f.expires_on || null, evidence_path: up.key,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Authorisation issued.' });
    setF(p => ({ ...p, authorisation_type_id: '', scope_site_id: '', scope_detail: '', issuing_authority: '', expires_on: '' })); setFile(null);
    router.refresh();
  }

  return (
    <Shell title="Issue an authorisation" open={open} setOpen={setOpen}
      note="An authorisation is never edited. To change one, revoke it and issue a new one.">
      {types.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active authorisation types in the catalogue yet.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className={grid}>
            <label className="block"><span className="label">Authorisation</span>
              <select className="input" required value={f.authorisation_type_id}
                onChange={e => { const x = types.find(y => y.id === e.target.value); setF(p => ({ ...p, authorisation_type_id: e.target.value, expires_on: suggestExpiry(p.issued_on, x?.validity_months) })); }}>
                <option value="">Choose…</option>
                {types.map(x => <option key={x.id} value={x.id}>{x.title}{x.safety_critical ? ' (safety-critical)' : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Site (optional)</span>
              <select className="input" value={f.scope_site_id} onChange={e => setF(p => ({ ...p, scope_site_id: e.target.value }))}>
                <option value="">Any site</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Scope (e.g. plant, LV only)</span>
              <input className="input" maxLength={300} value={f.scope_detail} onChange={e => setF(p => ({ ...p, scope_detail: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Issuing authority (optional)</span>
              <input className="input" maxLength={200} value={f.issuing_authority} onChange={e => setF(p => ({ ...p, issuing_authority: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Issued on</span>
              <input type="date" className="input" required value={f.issued_on}
                onChange={e => setF(p => ({ ...p, issued_on: e.target.value, expires_on: suggestExpiry(e.target.value, t?.validity_months) }))} />
            </label>
            <label className="block"><span className="label">Expires on (optional)</span>
              <input type="date" className="input" min={f.issued_on} value={f.expires_on} onChange={e => setF(p => ({ ...p, expires_on: e.target.value }))} />
            </label>
            <EvidenceInput onChange={setFile} />
          </div>
          <Submit busy={busy} label="Issue" />
        </form>
      )}
      <Feedback msg={msg} />
    </Shell>
  );
}

// ─── Development ────────────────────────────────────────────────────

export function AddDevelopmentForm({ companyId, personId, courses, competencies }: {
  companyId: string; personId: string; courses: Option[]; competencies: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ title: '', linked_course_id: '', linked_competency_id: '', due_date: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { setMsg({ ok: false, text: 'Give the item a title.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().from('development_items').insert({
      company_id: companyId, person_id: personId, title: f.title.trim(),
      linked_course_id: f.linked_course_id || null, linked_competency_id: f.linked_competency_id || null, due_date: f.due_date || null,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Development item added.' });
    setF({ title: '', linked_course_id: '', linked_competency_id: '', due_date: '' });
    router.refresh();
  }

  return (
    <Shell title="Add a development item" open={open} setOpen={setOpen}>
      <form onSubmit={submit} className="space-y-3">
        <div className={grid}>
          <label className="block sm:col-span-2"><span className="label">What needs developing</span>
            <input className="input" required maxLength={300} value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
          </label>
          <label className="block"><span className="label">Linked course (optional)</span>
            <select className="input" value={f.linked_course_id} onChange={e => setF(p => ({ ...p, linked_course_id: e.target.value }))}>
              <option value="">None</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Linked competency (optional)</span>
            <select className="input" value={f.linked_competency_id} onChange={e => setF(p => ({ ...p, linked_competency_id: e.target.value }))}>
              <option value="">None</option>
              {competencies.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Due (optional)</span>
            <input type="date" className="input" value={f.due_date} onChange={e => setF(p => ({ ...p, due_date: e.target.value }))} />
          </label>
        </div>
        <Submit busy={busy} label="Add" />
      </form>
      <Feedback msg={msg} />
    </Shell>
  );
}

// ─── Role assignments ───────────────────────────────────────────────

export function AssignRoleForm({ companyId, personId, roles, sites, departments }: {
  companyId: string; personId: string; roles: RoleOption[]; sites: SiteOption[]; departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({ role_id: '', site_id: '', department_id: '', primary_assignment: false, start_date: todayIso() });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.role_id) { setMsg({ ok: false, text: 'Choose the role.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().from('role_assignments').insert({
      company_id: companyId, person_id: personId, role_id: f.role_id, site_id: f.site_id || null,
      department_id: f.department_id || null, primary_assignment: f.primary_assignment, start_date: f.start_date,
      assignment_status: f.start_date > todayIso() ? planned : active,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Role assigned. Safe to Deploy will be recalculated from its requirements.' });
    setF({ role_id: '', site_id: '', department_id: '', primary_assignment: false, start_date: todayIso() });
    router.refresh();
  }

  return (
    <Shell title="Assign a role" open={open} setOpen={setOpen} note="Preview the role first to see what it would add.">
      {roles.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No active roles yet. Set roles up under Roles.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className={grid}>
            <label className="block"><span className="label">Role</span>
              <select className="input" required value={f.role_id} onChange={e => setF(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Choose…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.title}{r.safety_critical ? ' (safety-critical)' : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Starts on</span>
              <input type="date" className="input" required value={f.start_date} onChange={e => setF(p => ({ ...p, start_date: e.target.value }))} />
            </label>
            <label className="block"><span className="label">Site (optional)</span>
              <select className="input" value={f.site_id} onChange={e => setF(p => ({ ...p, site_id: e.target.value, department_id: '' }))}>
                <option value="">Not set</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Department (optional)</span>
              <select className="input" value={f.department_id} onChange={e => setF(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">Not set</option>
                {departments.filter(d => !f.site_id || !d.site_id || d.site_id === f.site_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={f.primary_assignment} onChange={e => setF(p => ({ ...p, primary_assignment: e.target.checked }))} />
              Primary role
            </label>
          </div>
          <Submit busy={busy} label="Assign role" />
        </form>
      )}
      <Feedback msg={msg} />
    </Shell>
  );
}

export function EndAssignmentButton({ assignmentId, startDate }: { assignmentId: string; startDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const today = todayIso();
  const [endDate, setEndDate] = useState(startDate > today ? startDate : today);
  const [reason, setReason] = useState('');

  async function end(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) { setMsg({ ok: false, text: 'Say why the assignment is ending.' }); return; }
    setBusy(true); setMsg(null);
    const res = await createClient().from('role_assignments')
      .update({ end_date: endDate, assignment_status: ended, ended_reason: reason.trim() }, COUNT_EXACT)
      .eq('id', assignmentId).neq('assignment_status', ended);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'Ending the assignment');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setOpen(true)}>End</button>;
  return (
    <form onSubmit={end} className="flex flex-col gap-2 min-w-[220px] no-print">
      <label className="block"><span className="label">End date</span>
        <input type="date" className="input" required min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} />
      </label>
      <label className="block"><span className="label">Reason</span>
        <input className="input" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      <span className="flex gap-1">
        <button type="submit" className="btn-secondary btn-sm" disabled={busy} style={{ color: 'var(--red)' }}>
          {busy && <Loader2 size={12} className="animate-spin" />} End assignment
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </span>
      <Feedback msg={msg} />
    </form>
  );
}
