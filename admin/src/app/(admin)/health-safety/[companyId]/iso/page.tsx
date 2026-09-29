import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ManagementSystemStandard, StandardClause, StandardEvidenceLink, IsoCertification } from '@/lib/hs/types';
import IsoClient from '@/components/hs/IsoClient';

export const metadata: Metadata = { title: 'ISO readiness' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 3 (158): the shared ISO 45001/14001
// management-system framework. Purely factual — clause count / clauses
// with evidence / clauses with no evidence — computed HERE from the two
// tables, never a stored score. See migration 158's own header comment
// for why: no percentage, no significance judgement, ever.
export default async function HealthSafetyIsoPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: standards, error: stdError }, { data: clauses, error: clauseError }, { data: links, error: linkError }, { data: certs, error: certError }] =
    await Promise.all([
      supabase.from('management_system_standards').select('id, code, name, created_at').order('code'),
      supabase.from('standard_clauses').select('id, standard_id, clause_number, title, maps_to_hint, display_order, created_at').order('display_order'),
      supabase.from('standard_evidence_links').select('id, company_id, clause_id, entity_type, entity_id, added_by, created_at').eq('company_id', params.companyId),
      supabase.from('iso_certifications').select('id, company_id, standard_id, certificate_number, certifying_body, issued_on, expires_on, created_by, created_at, updated_at').eq('company_id', params.companyId).order('expires_on'),
    ]);

  const error = stdError?.message ?? clauseError?.message ?? linkError?.message ?? certError?.message ?? null;

  return (
    <IsoClient
      companyId={params.companyId}
      standards={(standards ?? []) as ManagementSystemStandard[]}
      clauses={(clauses ?? []) as StandardClause[]}
      links={(links ?? []) as StandardEvidenceLink[]}
      certifications={(certs ?? []) as IsoCertification[]}
      loadError={error}
    />
  );
}
