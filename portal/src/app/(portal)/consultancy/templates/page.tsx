import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import type { ConsultancyVisitTemplate, ConsultancyVisitTemplateItem } from '@/lib/consultancy/types';
import TemplatesClient from './TemplatesClient';

export const metadata: Metadata = { title: 'Visit Templates' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 7, Group 2 (section 3: Visit Templates). Reads
// under the caller's OWN session, never the service role — a
// template belongs to exactly one consultancy
// (consultancy_visit_templates_consultancy_read, 173, keyed on
// my_home_company_id()), so RLS alone already answers "which
// templates may I see", the same way it does for every other
// single-tenant read in this codebase. No client-id scoping needed:
// a template is not about any one client.
export default async function VisitTemplatesPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const supabase = await createServerSupabaseClient();
  const { data: templates } = await supabase.from('consultancy_visit_templates')
    .select('*').order('name').limit(200);

  const templateIds = (templates ?? []).map((t: any) => t.id);
  const { data: items } = templateIds.length
    ? await supabase.from('consultancy_visit_template_items').select('*').in('template_id', templateIds).order('sort_order')
    : { data: [] as ConsultancyVisitTemplateItem[] };

  return (
    <TemplatesClient
      templates={(templates ?? []) as ConsultancyVisitTemplate[]}
      items={(items ?? []) as ConsultancyVisitTemplateItem[]}
    />
  );
}
