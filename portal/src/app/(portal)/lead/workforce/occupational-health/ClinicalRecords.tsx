'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { evidenceProblem } from '@/lib/hs/evidence';
import { clinicalKey, workforceEvidenceUrl, OH_CLINICAL_BUCKET } from '@/lib/workforce/evidence';
import { fmtDateTime } from '@/lib/hs/safetyFormat';

// Clinical occupational health records (135 occupational_health_clinical,
// bucket oh-clinical). Rendered — and its rows fetched — ONLY for a
// viewer holding an explicit occupational_health.clinical.read grant;
// the page never queries the table otherwise, and RLS refuses it anyway.
// Nothing here reaches Safe to Deploy, an export, a notification or the
// audit values. Records are never edited or deleted: add a new one.

export interface ClinicalRow {
  id: string;
  person_id: string;
  outcome_id: string | null;
  clinical_notes: string | null;
  document_path: string | null;
  created_at: string;
}

export default function ClinicalRecords({ companyId, people, rows, outcomes, loadError }: {
  companyId: string;
  people: { id: string; name: string }[];
  rows: ClinicalRow[];
  outcomes: { id: string; person_id: string; label: string }[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [personId, setPersonId] = useState('');
  const [outcomeId, setOutcomeId] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? 'Person not in your current view';
  const byPerson = new Map<string, ClinicalRow[]>();
  for (const r of rows) byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), r]);
  const groups = [...byPerson.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(null);
    if (!personId) { setError('Choose the person.'); return; }
    if (!notes.trim() && !file) { setError('Add clinical notes, a document, or both.'); return; }
    if (file) { const p = evidenceProblem(file); if (p) { setError(p); return; } }
    setBusy(true);
    // Upload first, then write the record that names the file: the
    // bucket lets a file be read only once a clinical record points at it.
    let key: string | null = null;
    if (file) {
      key = clinicalKey(companyId, personId, file.name);
      const { error: upErr } = await supabase.storage.from(OH_CLINICAL_BUCKET).upload(key, file, { contentType: file.type, upsert: false });
      if (upErr) { setBusy(false); setError(`Could not upload ${file.name}: ${upErr.message}`); return; }
    }
    const { error: err } = await supabase.from('occupational_health_clinical').insert({
      company_id: companyId,
      person_id: personId,
      outcome_id: outcomeId || null,
      clinical_notes: notes.trim() || null,
      document_path: key,
    });
    setBusy(false);
    if (err) {
      setError(key ? `The document uploaded but the record was not saved: ${err.message}. Try again; the uploaded copy stays unreadable until a record names it.` : err.message);
      return;
    }
    setDone(`Clinical record added for ${nameOf(personId)}.`);
    setNotes(''); setFile(null); setOutcomeId('');
    router.refresh();
  }

  async function openDoc(path: string) {
    setOpening(path); setError(null);
    const url = await workforceEvidenceUrl(supabase, path, OH_CLINICAL_BUCKET);
    setOpening(null);
    if (!url) { setError('The document could not be opened. You may no longer hold the clinical access grant.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="card p-4 space-y-4" aria-labelledby="clinical-title" style={{ borderColor: 'var(--red)' }}>
      <div className="flex items-start gap-2">
        <ShieldAlert size={18} style={{ color: 'var(--red)' }} aria-hidden />
        <div>
          <h2 id="clinical-title" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>Clinical records</h2>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Visible only to the occupational health advisor (an explicit clinical access grant). Managers, HR and Core OS 360 staff
            cannot see this section. Records are never edited or deleted — add a new one.
          </p>
        </div>
      </div>

      {loadError && <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>Clinical records could not be loaded: {loadError}</p>}

      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2" aria-label="Add a clinical record">
        <label className="block">
          <span className="label">Person</span>
          <select className="input" required value={personId} onChange={e => { setPersonId(e.target.value); setOutcomeId(''); }}>
            <option value="">Choose…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Linked outcome (optional)</span>
          <select className="input" value={outcomeId} onChange={e => setOutcomeId(e.target.value)} disabled={!personId}>
            <option value="">None</option>
            {outcomes.filter(o => o.person_id === personId).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="label">Clinical notes</span>
          <textarea className="input" rows={4} maxLength={20000} value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Document (optional)</span>
          <input className="input" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="text-sm md:col-span-2" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        {done && <p className="text-sm md:col-span-2" role="status" style={{ color: 'var(--teal)' }}>{done}</p>}
        <div className="md:col-span-2">
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Add clinical record
          </button>
        </div>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No clinical records yet.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map(([pid, list]) => (
            <li key={pid}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{nameOf(pid)}</h3>
              <ul className="mt-1 space-y-2">
                {list.map(r => (
                  <li key={r.id} className="p-2 rounded" style={{ background: 'var(--surface-soft)' }}>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {fmtDateTime(r.created_at)}{r.outcome_id ? ` · ${outcomes.find(o => o.id === r.outcome_id)?.label ?? 'linked outcome'}` : ''}
                    </p>
                    {r.clinical_notes && <p className="text-sm whitespace-pre-wrap mt-1">{r.clinical_notes}</p>}
                    {r.document_path && (
                      <button type="button" className="btn-ghost btn-sm mt-1" disabled={opening === r.document_path}
                        onClick={() => void openDoc(r.document_path!)}>
                        <FileText size={14} /> Open document
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
