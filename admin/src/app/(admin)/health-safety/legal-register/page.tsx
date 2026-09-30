import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { LegalRequirement } from '@/lib/hs/types';
import LegalRequirementsCatalogueClient from '@/components/hs/LegalRequirementsCatalogueClient';

export const metadata: Metadata = { title: 'Legal Register' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 4 (migration 159). The legal_requirements
// catalogue is staff-only reference SOURCE MATERIAL — a title, category,
// jurisdiction and a short internal summary staff write themselves,
// plus an optional link OUT to the real legislation. Never the actual
// statute text (see migration 159's own header). Per-client applicability
// and evaluation history live on /health-safety/<companyId>/legal.
export default async function LegalRegisterCataloguePage() {
  const supabase = await createServerSupabaseClient();
  const requirements = await readAllPages<LegalRequirement>((from, to) =>
    supabase.from('legal_requirements')
      .select('id, title, category, jurisdiction, summary, source_url, created_by, created_at, updated_at')
      .order('category').order('title').order('id').range(from, to));

  return (
    <>
      <AdminTopbar title="Legal Register" subtitle="The catalogue of legal source material this platform tracks — never a compliance verdict" />
      <main className="admin-page flex-1 space-y-4">
        <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          This is a register of source material only — a short internal summary and a link out to the real
          legislation, never the statute text itself. Whether a requirement applies to a specific client, and
          how they are evaluated against it, is recorded per client on that client&apos;s own legal register
          tab.
        </div>
        <LegalRequirementsCatalogueClient
          requirements={requirements.rows}
          loadError={requirements.error}
        />
      </main>
    </>
  );
}
