import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import EvidenceEngineClient, { type EvidenceFileListRow } from '@/components/hs/EvidenceEngineClient';

export const metadata: Metadata = { title: 'Evidence' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 11, Group 2. Two things on one page: the Evidence
// Library (every hs_files row for this client, newest first — capped
// at 200, well under the 1,000-row PostgREST ceiling, matching this
// codebase's own row-cap discipline for a page that is a browsing list,
// not an exhaustive export) and the register's own evidence-coverage
// gap report (Group 1). Both reads are under the staff session's own
// RLS — no service role needed.
export default async function EvidenceEnginePage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [filesRes, completionsRes, itemsRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', params.companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', params.companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', params.companyId).limit(500),
  ]);

  const loadError = filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message ?? null;

  const coverage = analyzeEvidenceCoverage({
    completions: (completionsRes.data ?? []) as RegisterCompletionRow[],
    items: (itemsRes.data ?? []) as ComplianceItemRow[],
    files: (filesRes.data ?? []) as EvidenceFileRow[],
  });

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load evidence: {loadError}</p>}
      <EvidenceEngineClient files={(filesRes.data ?? []) as EvidenceFileListRow[]} coverage={coverage} />
    </div>
  );
}
