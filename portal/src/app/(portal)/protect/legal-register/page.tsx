import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  LEGAL_APPLICABILITY_STATUS_LABELS, COMPLIANCE_EVALUATION_STATUS_LABELS,
  LEGAL_REQUIREMENT_CATEGORY_LABELS, type ComplianceEvaluationStatus,
} from '@/lib/hs/vocab';
import type { LegalRequirement, OrganisationLegalObligation, ComplianceEvaluation } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Legal Register' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const EVALUATION_COLOUR: Record<ComplianceEvaluationStatus, string> = {
  evidence_current:        'var(--teal)',
  evidence_incomplete:     'var(--gold)',
  review_due:              'var(--gold)',
  potential_noncompliance: 'var(--red)',
  confirmed_noncompliance: 'var(--red)',
  not_evaluated:           'var(--ink-faint)',
};

// Core-OS 360 Phase 5, Group 4 (migration 159). Read-only, staff-managed
// — nothing here is self-certified. The legal_requirements catalogue is
// staff-only RLS (a client never browses it), so titles for THIS
// client's own linked obligations are read with the service role,
// scoped to exactly the ids this session's own RLS-protected read of
// organisation_legal_obligations already returned — never a broader
// catalogue browse.
export default async function ProtectLegalRegisterPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: obligations, error: oblError } = await supabase.from('organisation_legal_obligations')
    .select('id, company_id, legal_requirement_id, applicability_status, assessed_at, assessment_rationale, next_review_due, created_at, updated_at')
    .eq('company_id', companyId).order('created_at').limit(500);
  const obligationRows = (obligations ?? []) as OrganisationLegalObligation[];

  const requirementIds = [...new Set(obligationRows.map(o => o.legal_requirement_id))];
  let catalogueById = new Map<string, LegalRequirement>();
  if (requirementIds.length > 0) {
    const svc = createServiceSupabaseClient();
    const { data: requirements } = await svc.from('legal_requirements')
      .select('id, title, category, jurisdiction, summary, source_url, created_by, created_at, updated_at')
      .in('id', requirementIds);
    catalogueById = new Map(((requirements ?? []) as LegalRequirement[]).map(r => [r.id, r]));
  }

  const obligationIds = obligationRows.map(o => o.id);
  const { data: evaluations, error: evalError } = obligationIds.length > 0
    ? await supabase.from('compliance_evaluations')
        .select('id, obligation_id, company_id, status, evaluated_at, notes, next_review_due')
        .in('obligation_id', obligationIds).order('evaluated_at', { ascending: false }).limit(500)
    : { data: [] as ComplianceEvaluation[], error: null };
  const evaluationRows = (evaluations ?? []) as ComplianceEvaluation[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {(oblError || evalError) && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>The legal register could not be loaded. Refresh to try again.</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        This shows the legal requirements Core OS 360 has recorded as applicable to your organisation and the
        evaluation history against each. This is a recorded evaluation state, never a legal conclusion — read the
        notes on each evaluation and speak to your Core OS 360 contact with any questions.
      </div>
      {obligationRows.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><Scale size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No legal requirements recorded for your organisation yet</p></div></div>
      ) : (
        <div className="space-y-4">
          {obligationRows.map(o => {
            const req = catalogueById.get(o.legal_requirement_id);
            const obligationEvaluations = evaluationRows.filter(e => e.obligation_id === o.id);
            return (
              <div key={o.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong>{req?.title ?? 'A legal requirement'}</strong>
                  {req && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{LEGAL_REQUIREMENT_CATEGORY_LABELS[req.category] ?? req.category}</span>}
                  <span className="ml-auto badge">{LEGAL_APPLICABILITY_STATUS_LABELS[o.applicability_status]}</span>
                </div>
                {req?.summary && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{req.summary}</p>}
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
            );
          })}
        </div>
      )}
    </main>
  );
}
