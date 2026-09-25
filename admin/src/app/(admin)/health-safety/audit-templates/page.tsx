import type { Metadata } from 'next';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HsAuditTemplate, HsAuditTemplateItem } from '@/lib/hs/types';
import AuditTemplatesClient from '@/components/hs/AuditTemplatesClient';

export const metadata: Metadata = { title: 'Audit Templates' };
export const dynamic = 'force-dynamic';

// Reusable checklists for the on-site audit runner. Staff reference
// data — never client-specific, never a Safety Timeline entry on its
// own (the same posture as sector packs).
export default async function AuditTemplatesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: templates, error }, { data: items }] = await Promise.all([
    supabase.from('hs_audit_templates').select('id, name, description, active').order('name'),
    supabase.from('hs_audit_template_items').select('id, template_id, category, prompt, guidance, sort_order').order('sort_order'),
  ]);

  return (
    <>
      <AdminTopbar title="Audit Templates" subtitle="Reusable checklists for the on-site audit runner" />
      <main className="admin-page flex-1 space-y-4">
        <AuditTemplatesClient
          templates={(templates ?? []) as HsAuditTemplate[]}
          items={(items ?? []) as HsAuditTemplateItem[]}
          loadError={error?.message ?? null}
        />
      </main>
    </>
  );
}
