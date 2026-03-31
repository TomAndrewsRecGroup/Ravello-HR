import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import RoadmapView from '@/components/modules/RoadmapView';
import type { Milestone } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'People Roadmap' };

function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}-${now.getFullYear()}`;
}

export default async function RoadmapPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user?.id ?? '')
    .single();

  const companyId: string = (profile as any)?.company_id ?? '';

  const { data: milestonesData } = await supabase
    .from('milestones')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order');

  const milestones: Milestone[] = (milestonesData ?? []) as Milestone[];
  const quarter = currentQuarter();

  return (
      <main className="portal-page flex-1">
        <RoadmapView milestones={milestones} initialQuarter={quarter} />
      </main>
  );
}
