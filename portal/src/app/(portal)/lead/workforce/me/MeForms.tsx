'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadWorkforceEvidence } from '@/lib/workforce/evidence';
import { REQUIREMENT_TYPE_LABELS, type RequirementType } from '@/lib/workforce/vocab';
import { todayIso } from '@/lib/hs/safetyFormat';

// Self-service submissions (spec 54, 79, 80). The person may add their
// OWN certificate or training record (134 self_submit policies:
// source 'self', person = me). The guard stores it unverified whatever
// is sent, stamps submitted_by, and fills the organisation from the
// person — so only the fields a person can honestly state are sent
// here. The file is uploaded FIRST into the person's own folder, then
// the record names it (storage read is granted by the record).

type Msg = { ok: boolean; text: string } | null;

export default function MeForms({ companyId, personId, credentialTypes, courses }: {
  companyId: string;
  personId: string;
  credentialTypes: { id: string; title: string; kind: string }[];
  courses: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState<'cred' | 'training' | null>(null);
  return (
    <section className="card p-4 space-y-3" aria-label="Add your own evidence">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={open === 'cred' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'} style={{ minHeight: 44 }}
          aria-expanded={open === 'cred'} onClick={() => setOpen(open === 'cred' ? null : 'cred')}>
          <Upload size={14} /> Upload a certificate
        </button>
        <button type="button" className={open === 'training' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'} style={{ minHeight: 44 }}
          aria-expanded={open === 'training'} onClick={() => setOpen(open === 'training' ? null : 'training')}>
          <GraduationCap size={14} /> Record training I completed
        </button>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Anything you add is checked by your organisation first. It counts towards Safe to Deploy once it is verified.
      </p>
      {open === 'cred' && <CredentialForm companyId={companyId} personId={personId} types={credentialTypes} onDone={() => setOpen(null)} />}
      {open === 'training' && <TrainingForm companyId={companyId} personId={personId} courses={courses} onDone={() => setOpen(null)} />}
    </section>
  );
}

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p className="text-sm" role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>;
}

function CredentialForm({ companyId, personId, types, onDone }: {
  companyId: string; personId: string; types: { id: string; title: string; kind: string }[]; onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ typeId: '', number: '', body: '', issued: '', expires: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!f.typeId) { setMsg({ ok: false, text: 'Choose what the certificate is.' }); return; }
    if (!file) { setMsg({ ok: false, text: 'Attach a photo or scan of the certificate.' }); return; }
    if (f.issued && f.expires && f.expires < f.issued) { setMsg({ ok: false, text: 'The expiry date must be on or after the issue date.' }); return; }
    setBusy(true);
    const supabase = createClient();
    const up = await uploadWorkforceEvidence(supabase, { companyId, kind: 'credential', personId, file });
    if (up.error !== null) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
    const { error } = await supabase.from('person_credentials').insert({
      company_id: companyId, person_id: personId, credential_type_id: f.typeId, source: 'self',
      credential_number: f.number.trim() || null, awarding_body: f.body.trim() || null,
      issued_on: f.issued || null, expires_on: f.expires || null, evidence_path: up.key,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `Not saved: ${error.message}` }); return; }
    setMsg({ ok: true, text: 'Submitted — it counts once it is verified.' });
    setF({ typeId: '', number: '', body: '', issued: '', expires: '' }); setFile(null);
    router.refresh();
    setTimeout(onDone, 2500);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 grid-cols-1 sm:grid-cols-2" noValidate>
      <label className="block sm:col-span-2"><span className="label">What is it?</span>
        <select className="input" required value={f.typeId} onChange={e => setF({ ...f, typeId: e.target.value })}>
          <option value="">Choose…</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.title} ({REQUIREMENT_TYPE_LABELS[t.kind as RequirementType] ?? t.kind})</option>)}
        </select>
        {types.length === 0 && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Your organisation has not set up any certificate types yet.</span>}
      </label>
      <label className="block"><span className="label">Number (optional)</span>
        <input className="input" maxLength={120} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} />
      </label>
      <label className="block"><span className="label">Awarded by (optional)</span>
        <input className="input" maxLength={200} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      </label>
      <label className="block"><span className="label">Issued on</span>
        <input className="input" type="date" max={todayIso()} value={f.issued} onChange={e => setF({ ...f, issued: e.target.value })} />
      </label>
      <label className="block"><span className="label">Expires on (if it shows one)</span>
        <input className="input" type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} />
      </label>
      <label className="block sm:col-span-2"><span className="label">Photo or scan</span>
        <input className="input" type="file" accept="application/pdf,image/*" capture="environment" required
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-cta btn-sm" style={{ minHeight: 44 }} disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Submit for verification
        </button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

function TrainingForm({ companyId, personId, courses, onDone }: {
  companyId: string; personId: string; courses: { id: string; title: string }[]; onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ courseId: '', completed: '', expires: '', number: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const course = courses.find(c => c.id === f.courseId);
    if (!course) { setMsg({ ok: false, text: 'Choose the course you completed.' }); return; }
    if (!f.completed) { setMsg({ ok: false, text: 'Enter the date you completed it.' }); return; }
    if (f.completed > todayIso()) { setMsg({ ok: false, text: 'The completion date cannot be in the future.' }); return; }
    if (f.expires && f.expires <= f.completed) { setMsg({ ok: false, text: 'The expiry date must be after the completion date.' }); return; }
    setBusy(true);
    const supabase = createClient();
    let evidencePath: string | null = null;
    if (file) {
      const up = await uploadWorkforceEvidence(supabase, { companyId, kind: 'training', personId, file });
      if (up.error !== null) { setBusy(false); setMsg({ ok: false, text: up.error }); return; }
      evidencePath = up.key;
    }
    const { error } = await supabase.from('training_records').insert({
      company_id: companyId, person_id: personId, course_id: course.id, course_name: course.title,
      completed_on: f.completed, expires_on: f.expires || null, result: 'pass', source: 'self',
      certificate_number: f.number.trim() || null, evidence_path: evidencePath,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: `Not saved: ${error.message}` }); return; }
    setMsg({ ok: true, text: 'Submitted — it counts once it is verified.' });
    setF({ courseId: '', completed: '', expires: '', number: '' }); setFile(null);
    router.refresh();
    setTimeout(onDone, 2500);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 grid-cols-1 sm:grid-cols-2" noValidate>
      <label className="block sm:col-span-2"><span className="label">Course</span>
        <select className="input" required value={f.courseId} onChange={e => setF({ ...f, courseId: e.target.value })}>
          <option value="">Choose…</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {courses.length === 0 && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Your organisation has not set up any courses yet.</span>}
      </label>
      <label className="block"><span className="label">Completed on</span>
        <input className="input" type="date" required max={todayIso()} value={f.completed} onChange={e => setF({ ...f, completed: e.target.value })} />
      </label>
      <label className="block"><span className="label">Certificate expires (if it shows one)</span>
        <input className="input" type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} />
      </label>
      <label className="block"><span className="label">Certificate number (optional)</span>
        <input className="input" maxLength={120} value={f.number} onChange={e => setF({ ...f, number: e.target.value })} />
      </label>
      <label className="block"><span className="label">Certificate file (optional)</span>
        <input className="input" type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-cta btn-sm" style={{ minHeight: 44 }} disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Submit for verification
        </button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}
