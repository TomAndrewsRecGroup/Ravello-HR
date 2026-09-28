'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HEALTH_OUTCOMES, HEALTH_OUTCOME_LABELS, type HealthOutcome } from '@/lib/workforce/vocab';

// Record an occupational health OUTCOME (135 person_health_outcomes),
// for holders of occupational_health.manage. The operational summary
// only: no diagnosis field exists. Outcomes are never edited — a new
// assessment is a new record — and nobody records their own (the
// database refuses both; its message is shown as written).
export default function RecordOutcome({ companyId, people, requirements, today, defaultPerson, defaultRequirement }: {
  companyId: string;
  people: { id: string; name: string }[];
  requirements: { id: string; title: string }[];
  today: string;
  defaultPerson?: string;
  defaultRequirement?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(Boolean(defaultPerson));
  const [personId, setPersonId] = useState(people.some(p => p.id === defaultPerson) ? defaultPerson! : '');
  const [requirementId, setRequirementId] = useState(requirements.some(r => r.id === defaultRequirement) ? defaultRequirement! : '');
  const [assessedOn, setAssessedOn] = useState(today);
  const [outcome, setOutcome] = useState<HealthOutcome>('fit');
  const [restriction, setRestriction] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [provider, setProvider] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const needsRestriction = outcome === 'fit_with_restrictions';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(null);
    if (!personId || !requirementId) { setError('Choose the person and the requirement.'); return; }
    if (needsRestriction && restriction.trim().length < 3) { setError('Describe the restriction (at least 3 characters).'); return; }
    if (reviewDate && reviewDate < assessedOn) { setError('The review date cannot be before the assessment date.'); return; }
    setBusy(true);
    const { error: err } = await supabase.from('person_health_outcomes').insert({
      company_id: companyId,
      person_id: personId,
      requirement_id: requirementId,
      assessed_on: assessedOn,
      outcome,
      restriction_summary: restriction.trim() || null,
      review_date: reviewDate || null,
      provider: provider.trim() || null,
      evidence_ref: evidenceRef.trim() || null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    const who = people.find(p => p.id === personId)?.name ?? 'the person';
    setDone(`Outcome recorded for ${who}. Safe to Deploy is recalculated from it.`);
    setRestriction(''); setReviewDate(''); setEvidenceRef('');
    router.refresh();
  }

  return (
    <section id="record-outcome" className="card p-4 space-y-3" aria-labelledby="record-outcome-title">
      <div className="flex items-center gap-2">
        <h2 id="record-outcome-title" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>Record an outcome</h2>
        <button type="button" className="btn-ghost btn-sm ml-auto" aria-expanded={open} aria-controls="record-outcome-form"
          onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Open'}</button>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Outcomes are never edited: a new assessment is a new record. Record the operational outcome only — clinical notes
        belong in the clinical record. You cannot record your own outcome.
      </p>
      {done && <p className="text-sm" role="status" style={{ color: 'var(--teal)' }}>{done}</p>}
      {open && (
        <form id="record-outcome-form" onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Person</span>
            <select className="input" required value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">Choose…</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Requirement</span>
            <select className="input" required value={requirementId} onChange={e => setRequirementId(e.target.value)}>
              <option value="">Choose…</option>
              {requirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Assessed on</span>
            <input className="input" type="date" required max={today} value={assessedOn} onChange={e => setAssessedOn(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Outcome</span>
            <select className="input" required value={outcome} onChange={e => setOutcome(e.target.value as HealthOutcome)}>
              {HEALTH_OUTCOMES.map(o => <option key={o} value={o}>{HEALTH_OUTCOME_LABELS[o]}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">Restriction summary{needsRestriction ? ' (required)' : ' (optional)'}</span>
            <input className="input" maxLength={500} required={needsRestriction} value={restriction}
              onChange={e => setRestriction(e.target.value)} placeholder="Operational, e.g. no work at height — no diagnosis" />
          </label>
          <label className="block">
            <span className="label">Review date (optional)</span>
            <input className="input" type="date" min={assessedOn} value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Provider (optional)</span>
            <input className="input" maxLength={200} value={provider} onChange={e => setProvider(e.target.value)} />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Evidence reference (optional)</span>
            <input className="input" maxLength={200} value={evidenceRef} onChange={e => setEvidenceRef(e.target.value)}
              placeholder="The provider's report number" />
          </label>
          {error && <p className="text-sm md:col-span-2" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="md:col-span-2">
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />} Record outcome
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
