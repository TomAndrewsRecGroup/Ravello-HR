import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HsAuditTemplate, HsAuditTemplateItem } from '@/lib/hs/types';
import AuditRunner from '@/components/hs/AuditRunner';

export const metadata: Metadata = { title: 'Run an audit' };
export const dynamic = 'force-dynamic';

interface Site { id: string; name: string; }

export default async function NewAuditPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: sites }, { data: templates }, { data: items }] = await Promise.all([
    supabase.from('hs_sites').select('id, name').eq('company_id', params.companyId).eq('active', true).order('name'),
    supabase.from('hs_audit_templates').select('id, name, description, active').eq('active', true).order('name'),
    supabase.from('hs_audit_template_items').select('id, template_id, category, prompt, guidance, sort_order').order('sort_order'),
  ]);

  return (
    <AuditRunner
      companyId={params.companyId}
      sites={(sites ?? []) as Site[]}
      templates={(templates ?? []) as HsAuditTemplate[]}
      templateItems={(items ?? []) as HsAuditTemplateItem[]}
    />
  );
}
