import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import PlanEditor from './PlanEditor';

export const dynamic = 'force-dynamic';

export default async function DevPlanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const [{ data: plan }, { data: milestones }, { data: companies }, { data: athletes }, { data: templates }] = await Promise.all([
    supabase.from('dev_plans').select('*').eq('id', params.id).single(),
    supabase.from('dev_plan_milestones').select('*').eq('plan_id', params.id).order('sort_order'),
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
    supabase.from('athletes').select('id, full_name, company_id').order('full_name'),
    supabase.from('dev_plan_templates').select('id, name, description, milestones').order('name'),
  ]);
  if (!plan) notFound();

  const { data: brandProfile } = plan.brand_profile_id
    ? await supabase.from('brand_profiles').select('*').eq('id', plan.brand_profile_id).single()
    : { data: null };

  return (
    <>
      <AdminTopbar title={plan.title} subtitle="Development plan editor" />
      <main className="admin-page flex-1">
        <PlanEditor
          plan={plan}
          milestones={milestones ?? []}
          brandProfile={brandProfile ?? null}
          companies={companies ?? []}
          athletes={athletes ?? []}
          templates={templates ?? []}
          initialCompanyId={null}
          initialAthleteId={null}
          prefillFromTemplate={null}
        />
      </main>
    </>
  );
}
