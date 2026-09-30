import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  analyzeEvidenceCoverage, crossReferenceComplianceItems,
  type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow,
  type StandardEvidenceLinkRow, type RequirementEvidenceLinkRow,
} from '@/lib/evidenceEngine/analyze';
import EvidenceEngineClient, { type EvidenceFileListRow } from '@/components/hs/EvidenceEngineClient';

export const metadata: Metadata = { title: 'Evidence' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 11, Group 2, extended in Phase 23 Group 3 (closes
// C11.3, C11.4, C11.5). Three things on one page: the Evidence Library
// (every hs_files row for this client, newest first — capped at 200,
// well under the 1,000-row PostgREST ceiling, matching this codebase's
// own row-cap discipline for a page that is a browsing list, not an
// exhaustive export), the register's own evidence-coverage gap report
// (Group 1, current-vs-history split), and cross-reference counts into
// the ISO/Legal/Objectives/Audit-findings catalogues. Every read is
// under the staff session's own RLS — no service role needed.
export default async function EvidenceEnginePage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [filesRes, completionsRes, itemsRes, isoLinksRes, reqLinksRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', params.companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', params.companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', params.companyId).limit(500),
    supabase.from('standard_evidence_links').select('entity_id')
      .eq('company_id', params.companyId).eq('entity_type', 'compliance_item').limit(500),
    supabase.from('requirement_evidence_links').select('entity_id, source_type')
      .eq('company_id', params.companyId).eq('entity_type', 'compliance_item').limit(500),
  ]);

  const loadError = filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message
    ?? isoLinksRes.error?.message ?? reqLinksRes.error?.message ?? null;

  const items = (itemsRes.data ?? []) as ComplianceItemRow[];

  const coverage = analyzeEvidenceCoverage({
    completions: (completionsRes.data ?? []) as RegisterCompletionRow[],
    items,
    files: (filesRes.data ?? []) as EvidenceFileRow[],
  });

  const crossReferences = crossReferenceComplianceItems({
    itemIds: items.map(i => i.id),
    standardEvidenceLinks: (isoLinksRes.data ?? []) as StandardEvidenceLinkRow[],
    requirementEvidenceLinks: (reqLinksRes.data ?? []) as RequirementEvidenceLinkRow[],
  });

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load evidence: {loadError}</p>}
      <EvidenceEngineClient
        files={(filesRes.data ?? []) as EvidenceFileListRow[]} coverage={coverage} items={items}
        crossReferences={crossReferences} role="admin" companyId={params.companyId}
      />
    </div>
  );
}
