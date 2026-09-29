'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, Scale } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  LEGAL_APPLICABILITY_STATUSES, LEGAL_APPLICABILITY_STATUS_LABELS, type LegalApplicabilityStatus,
  COMPLIANCE_EVALUATION_STATUSES, COMPLIANCE_EVALUATION_STATUS_LABELS, type ComplianceEvaluationStatus,
  LEGAL_REQUIREMENT_CATEGORY_LABELS,
} from '@/lib/hs/vocab';
import type { LegalRequirement, OrganisationLegalObligation, ComplianceEvaluation } from '@/lib/hs/types';

interface Props {
  companyId: string;
  catalogue: LegalRequirement[];
  obligations: OrganisationLegalObligation[];
  evaluations: ComplianceEvaluation[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const APPLICABILITY_COLOUR: Record<LegalApplicabilityStatus, string> = {
  not_assessed:   'var(--ink-faint)',
  applicable:     'var(--blue)',
  not_applicable: 'var(--ink-faint)',
  under_review:   'var(--gold)',
};

// Rule 2 is EXACT and absolute here: never "compliant"/"non-compliant"/
// "legal"/"illegal" anywhere in this UI. compliance_evaluations.status
// is the one cautious vocabulary this page may ever display.
const EVALUATION_COLOUR: Record<ComplianceEvaluationStatus, string> = {
  evidence_current:        'var(--teal)',
  evidence_incomplete:     'var(--gold)',
  review_due:              'var(--gold)',
  potential_noncompliance: 'var(--red)',
  confirmed_noncompliance: 'var(--red)',
  not_evaluated:           'var(--ink-faint)',
};

export default function LegalRegisterClient({ companyId, catalogue, obligations, evaluations, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evalOpenFor, setEvalOpenFor] = useState<string | null>(null);

  const [pickedRequirementId, setPickedRequirementId] = useState('');

  const [applicability, setApplicability] = useState<Record<string, LegalApplicabilityStatus>>({});
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [confirmedByAssessor, setConfirmedByAssessor] = useState<Record<string, boolean>>({});

  const [evalStatus, setEvalStatus] = useState<ComplianceEvaluationStatus>('not_evaluated');
  const [evalNotes, setEvalNotes] = useState('');
  const [evalNextReview, setEvalNextReview] = useState('');

  const catalogueById = new Map(catalogue.map(r => [r.id, r]));
  const linkedRequirementIds = new Set(obligations.map(o => o.legal_requirement_id));
  const unlinked = catalogue.filter(r => !linkedRequirementIds.has(r.id));

  async function linkRequirement(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedRequirementId) return;
    setBusy(true);
    const { error } = await createClient().from('organisation_legal_obligations').insert({
      company_id: companyId, legal_requirement_id: pickedRequirementId,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Requirement linked to this client', 'success');
    setPickedRequirementId(''); setLinkOpen(false);
    router.refresh();
  }

  // Rule 1, absolute: an 'applicable'/'not_applicable' decision needs a
  // named assessor and a timestamp — the DATABASE refuses one without
  // it (organisation_legal_obligations_stamp(), migration 159), so this
  // form cannot bypass the gate even if the confirmation checkbox were
  // skipped: the insert would simply fail. 'under_review' needs no
  // assessor — it is a flag, not a decision.
  async function saveApplicability(obligation: OrganisationLegalObligation) {
    const status = applicability[obligation.id] ?? obligation.applicability_status;
    const needsConfirmation = status === 'applicable' || status === 'not_applicable';
    if (needsConfirmation && !confirmedByAssessor[obligation.id]) {
      toast('Confirm this applicability decision — it is never decided automatically.', 'error');
      return;
    }
    setBusy(true);
    const sb = createClient();
    let assessedBy: string | null = null;
    let assessedAt: string | null = null;
    if (needsConfirmation) {
      const { data: userData } = await sb.auth.getUser();
      assessedBy = userData?.user?.id ?? null;
      if (!assessedBy) { setBusy(false); toast('Could not identify the signed-in user to confirm this decision.', 'error'); return; }
      assessedAt = new Date().toISOString();
    }
    const res = await sb.from('organisation_legal_obligations').update({
      applicability_status: status,
      assessment_rationale: rationale[obligation.id]?.trim() || null,
      ...(needsConfirmation ? { assessed_by: assessedBy, assessed_at: assessedAt } : {}),
    }, COUNT_EXACT).eq('id', obligation.id);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    toast('Applicability decision saved', 'success');
    router.refresh();
  }

  async function submitEvaluation(obligationId: string, e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('compliance_evaluations').insert({
      obligation_id: obligationId, status: evalStatus,
      notes: evalNotes.trim() || null, next_review_due: evalNextReview || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Evaluation recorded', 'success');
    setEvalStatus('not_evaluated'); setEvalNotes(''); setEvalNextReview(''); setEvalOpenFor(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Applicability is a human decision, never automatic. Evaluations use a cautious, factual vocabulary — this
        register never asserts a compliance conclusion on its own authority.
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn-cta btn-sm" onClick={() => setLinkOpen(o => !o)}>
          <Plus size={14} className="mr-1" /> Link a legal requirement
        </button>
      </div>
      {linkOpen && (
        <form onSubmit={linkRequirement} className="card p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Requirement</label>
            <select className="input" required value={pickedRequirementId} onChange={e => setPickedRequirementId(e.target.value)}>
              <option value="">Select…</option>
              {unlinked.map(r => (
                <option key={r.id} value={r.id}>{r.title} ({LEGAL_REQUIREMENT_CATEGORY_LABELS[r.category] ?? r.category})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy || !pickedRequirementId}>Link</button>
        </form>
      )}

      {obligations.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Scale size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No legal requirements linked to this client yet</p></div></div>
      ) : (
        <div className="space-y-3">
          {obligations.map(o => {
            const req = catalogueById.get(o.legal_requirement_id);
            const isExpanded = expanded === o.id;
            const obligationEvaluations = evaluations.filter(e => e.obligation_id === o.id);
            const currentStatus = applicability[o.id] ?? o.applicability_status;
            const needsConfirmation = currentStatus === 'applicable' || currentStatus === 'not_applicable';
            return (
              <div key={o.id} className="card p-0 overflow-hidden">
                <button type="button" className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(isExpanded ? null : o.id)}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong>{req?.title ?? 'Unknown requirement'}</strong>
                    {req && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{LEGAL_REQUIREMENT_CATEGORY_LABELS[req.category] ?? req.category}</span>}
                    <span className="ml-auto text-sm font-medium" style={{ color: APPLICABILITY_COLOUR[o.applicability_status] }}>
                      {LEGAL_APPLICABILITY_STATUS_LABELS[o.applicability_status]}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--line)' }}>
                    {req?.summary && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{req.summary}</p>}

                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Applicability</h4>
                      <select
                        className="input"
                        value={currentStatus}
                        onChange={e => setApplicability(prev => ({ ...prev, [o.id]: e.target.value as LegalApplicabilityStatus }))}
                      >
                        {LEGAL_APPLICABILITY_STATUSES.map(s => <option key={s} value={s}>{LEGAL_APPLICABILITY_STATUS_LABELS[s]}</option>)}
                      </select>
                      <textarea
                        className="input" rows={2} placeholder="Assessment rationale (optional)"
                        value={rationale[o.id] ?? o.assessment_rationale ?? ''}
                        onChange={e => setRationale(prev => ({ ...prev, [o.id]: e.target.value }))}
                      />
                      {needsConfirmation && (
                        <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                          <input
                            type="checkbox" className="mt-1"
                            checked={confirmedByAssessor[o.id] ?? false}
                            onChange={e => setConfirmedByAssessor(prev => ({ ...prev, [o.id]: e.target.checked }))}
                          />
                          I confirm this applicability decision. This is a human decision — the platform never
                          decides applicability automatically.
                        </label>
                      )}
                      {o.assessed_at && (
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Last assessed {fmt(o.assessed_at)}</p>
                      )}
                      <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => saveApplicability(o)}>Save applicability</button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Evaluation history</h4>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setEvalOpenFor(evalOpenFor === o.id ? null : o.id)}>
                          <Plus size={12} className="mr-1" /> Record evaluation
                        </button>
                      </div>
                      {evalOpenFor === o.id && (
                        <form onSubmit={e => submitEvaluation(o.id, e)} className="grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="label">Status</label>
                            <select className="input" value={evalStatus} onChange={e => setEvalStatus(e.target.value as ComplianceEvaluationStatus)}>
                              {COMPLIANCE_EVALUATION_STATUSES.map(s => <option key={s} value={s}>{COMPLIANCE_EVALUATION_STATUS_LABELS[s]}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label">Next review due</label>
                            <input type="date" className="input" value={evalNextReview} onChange={e => setEvalNextReview(e.target.value)} />
                          </div>
                          <div className="col-span-2">
                            <label className="label">Notes</label>
                            <textarea className="input" rows={2} value={evalNotes} onChange={e => setEvalNotes(e.target.value)} />
                          </div>
                          <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save evaluation</button>
                        </form>
                      )}
                      {obligationEvaluations.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No evaluations recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {obligationEvaluations.map(ev => (
                            <li key={ev.id} className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex items-center justify-between">
                                <span className="font-medium" style={{ color: EVALUATION_COLOUR[ev.status] }}>{COMPLIANCE_EVALUATION_STATUS_LABELS[ev.status]}</span>
                                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmt(ev.evaluated_at)}</span>
                              </div>
                              {ev.notes && <p className="mt-1" style={{ color: 'var(--ink-soft)' }}>{ev.notes}</p>}
                              {ev.next_review_due && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Next review: {fmt(ev.next_review_due)}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
