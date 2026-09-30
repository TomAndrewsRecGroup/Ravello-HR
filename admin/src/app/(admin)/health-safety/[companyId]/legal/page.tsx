import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { LegalRequirement, OrganisationLegalObligation, ComplianceEvaluation, RequirementEvidenceLink } from '@/lib/hs/types';
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
        .eq('company_id', params.companyId).order('created_at').order('id').range(from, to)),
  ]);

  const obligationIds = obligations.rows.map(o => o.id);
  const [{ data: evaluations, error: evalError }, { data: evidenceLinks, error: linksError }] = await Promise.all([
    obligationIds.length > 0
      ? supabase.from('compliance_evaluations')
          .select('id, obligation_id, company_id, status, evaluated_by, evaluated_at, notes, next_review_due, created_at')
          .in('obligation_id', obligationIds).order('evaluated_at', { ascending: false })
      : Promise.resolve({ data: [] as ComplianceEvaluation[], error: null }),
    // Evidence-link foundation (163): fetched by id list, never blind —
    // the same "fetch by id list" shape the referral PATCH route and
    // the H&S test-logging routes already established.
    obligationIds.length > 0
      ? supabase.from('requirement_evidence_links')
          .select('id, company_id, source_type, source_id, entity_type, entity_id, added_by, created_at')
          .eq('source_type', 'legal_obligation').in('source_id', obligationIds)
      : Promise.resolve({ data: [] as RequirementEvidenceLink[], error: null }),
  ]);

  return (
    <LegalRegisterClient
      companyId={params.companyId}
      catalogue={(catalogue ?? []) as LegalRequirement[]}
      obligations={obligations.rows}
      evaluations={(evaluations ?? []) as ComplianceEvaluation[]}
      evidenceLinks={(evidenceLinks ?? []) as RequirementEvidenceLink[]}
      loadError={catError?.message ?? obligations.error ?? evalError?.message ?? linksError?.message ?? null}
    />
  );
}
