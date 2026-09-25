import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HsAudit, HsAuditResponse, HsFile } from '@/lib/hs/types';
import AuditDetailClient from '@/components/hs/AuditDetailClient';

export const metadata: Metadata = { title: 'Audit detail' };
export const dynamic = 'force-dynamic';

// One completed audit: every answer, and any evidence photo attached to
// a specific failed one (113). hs_audit_responses is insert-only (110)
// and never itself a Timeline source — this page is the one place to
// see the individual findings the list page's row only counts.
export default async function HealthSafetyAuditDetailPage(props: { params: Promise<{ companyId: string; auditId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const { data: audit } = await supabase
    .from('hs_audits')
    .select('id, company_id, site_id, template_id, title, conducted_on, score, notes, recorded_by_kind, created_at')
    .eq('id', params.auditId)
    .eq('company_id', params.companyId)
    .maybeSingle();
  if (!audit) notFound();

  const { data: responses, error } = await supabase
    .from('hs_audit_responses')
    .select('id, audit_id, company_id, template_item_id, prompt, category, rating, comment, sort_order, created_at')
    .eq('audit_id', params.auditId)
    .order('sort_order', { ascending: true });

  const rows = (responses ?? []) as HsAuditResponse[];
  const responseIds = rows.map(r => r.id);

  const { data: files } = responseIds.length > 0
    ? await supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .eq('entity_type', 'audit_response')
        .in('entity_id', responseIds)
    : { data: [] };

  return (
    <div className="space-y-4">
      <Link href={`/health-safety/${params.companyId}/audits`} className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-faint)' }}>
        <ChevronLeft size={14} /> Back to audits
      </Link>
      <AuditDetailClient
        audit={audit as HsAudit}
        responses={rows}
        files={(files ?? []) as HsFile[]}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
