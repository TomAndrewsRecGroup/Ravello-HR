import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import EvidenceEngineClient, { type EvidenceFileListRow } from '@/components/hs/EvidenceEngineClient';

export const metadata: Metadata = { title: 'Evidence' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 11, Group 2. Read-only — nothing here is
// self-certified, the standing PROTECT posture. Same computation and
// presentational component as the admin page, mirrored
// byte-identical. Every read is under the client's own session RLS
// (hs_files_client_read / hs_completions_client_read) — no service
// role needed.
export default async function ProtectEvidencePage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [filesRes, completionsRes, itemsRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', companyId).limit(500),
  ]);

  const loadError = filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message ?? null;

  const coverage = analyzeEvidenceCoverage({
    completions: (completionsRes.data ?? []) as RegisterCompletionRow[],
    items: (itemsRes.data ?? []) as ComplianceItemRow[],
    files: (filesRes.data ?? []) as EvidenceFileRow[],
  });

  return (
    <main className="portal-page flex-1 space-y-4">
      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load evidence: {loadError}</p>}
      <EvidenceEngineClient files={(filesRes.data ?? []) as EvidenceFileListRow[]} coverage={coverage} />
    </main>
  );
}
