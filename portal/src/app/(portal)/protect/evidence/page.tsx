import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import {
  analyzeEvidenceCoverage, crossReferenceComplianceItems,
  type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow,
  type StandardEvidenceLinkRow, type RequirementEvidenceLinkRow,
} from '@/lib/evidenceEngine/analyze';
import EvidenceEngineClient, { type EvidenceFileListRow } from '@/components/hs/EvidenceEngineClient';

export const metadata: Metadata = { title: 'Evidence' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 11, Group 2, extended in Phase 23 Group 3 (closes
// C11.3, C11.4, C11.5). Read-only — nothing here is self-certified,
// the standing PROTECT posture. Same computation and presentational
// component as the admin page, mirrored byte-identical. Every read is
// under the client's own session RLS (hs_files_client_read /
// hs_completions_client_read / standard_evidence_links_read /
// requirement_evidence_links_read) — no service role needed.
export default async function ProtectEvidencePage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [filesRes, completionsRes, itemsRes, isoLinksRes, reqLinksRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', companyId).limit(500),
    supabase.from('standard_evidence_links').select('entity_id')
      .eq('company_id', companyId).eq('entity_type', 'compliance_item').limit(500),
    supabase.from('requirement_evidence_links').select('entity_id, source_type')
      .eq('company_id', companyId).eq('entity_type', 'compliance_item').limit(500),
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
    <main className="portal-page flex-1 space-y-4">
      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load evidence: {loadError}</p>}
      <EvidenceEngineClient
        files={(filesRes.data ?? []) as EvidenceFileListRow[]} coverage={coverage} items={items}
        crossReferences={crossReferences} role="portal" companyId={companyId}
      />
    </main>
  );
}
