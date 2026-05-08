import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import PlanEditor from '../[id]/PlanEditor';

export const dynamic = 'force-dynamic';

export default async function NewDevPlanPage({
  searchParams,
}: { searchParams: { template?: string; company?: string; athlete?: string } }) {
  const supabase = createServerSupabaseClient();
  const [{ data: companies }, { data: athletes }, { data: templates }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('active', true).order('name'),
    supabase.from('athletes').select('id, full_name, company_id').order('full_name'),
    supabase.from('dev_plan_templates').select('id, name, description, milestones').order('name'),
  ]);

  let prefillFromTemplate = null;
  if (searchParams.template) {
    prefillFromTemplate = templates?.find(t => t.id === searchParams.template) ?? null;
  }

  return (
    <>
      <AdminTopbar title="New Development Plan" subtitle="Create a new development plan and assign it to an athlete." />
      <main className="admin-page flex-1">
        <PlanEditor
          plan={null}
          milestones={[]}
          brandProfile={null}
          companies={companies ?? []}
          athletes={athletes ?? []}
          templates={templates ?? []}
          initialCompanyId={searchParams.company ?? null}
          initialAthleteId={searchParams.athlete ?? null}
          prefillFromTemplate={prefillFromTemplate}
        />
      </main>
    </>
  );
}
