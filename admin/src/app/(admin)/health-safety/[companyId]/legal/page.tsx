import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { LegalRequirement, OrganisationLegalObligation, ComplianceEvaluation } from '@/lib/hs/types';
import LegalRegisterClient from '@/components/hs/LegalRegisterClient';

export const metadata: Metadata = { title: 'Legal register' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 4 (migration 159). Per-company: which legal
// requirements from the catalogue apply here (a human decision, never
// automatic), and the evaluation history against each. Staff-managed —
// this is a staff-delivered service, the same posture the H&S register
// has held since Phase 1b.
export default async function HealthSafetyLegalRegisterPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: catalogue, error: catError }, obligations] = await Promise.all([
    supabase.from('legal_requirements')
      .select('id, title, category, jurisdiction, summary, source_url, created_by, created_at, updated_at')
      .order('category').order('title'),
    readAllPages<OrganisationLegalObligation>((from, to) =>
      supabase.from('organisation_legal_obligations')
        .select('id, company_id, legal_requirement_id, applicability_status, assessed_by, assessed_at, assessment_rationale, next_review_due, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('created_at').range(from, to)),
  ]);

  const obligationIds = obligations.rows.map(o => o.id);
  const { data: evaluations, error: evalError } = obligationIds.length > 0
    ? await supabase.from('compliance_evaluations')
        .select('id, obligation_id, company_id, status, evaluated_by, evaluated_at, notes, next_review_due, created_at')
        .in('obligation_id', obligationIds).order('evaluated_at', { ascending: false })
    : { data: [] as ComplianceEvaluation[], error: null };

  return (
    <LegalRegisterClient
      companyId={params.companyId}
      catalogue={(catalogue ?? []) as LegalRequirement[]}
      obligations={obligations.rows}
      evaluations={(evaluations ?? []) as ComplianceEvaluation[]}
      loadError={catError?.message ?? obligations.error ?? evalError?.message ?? null}
    />
  );
}
