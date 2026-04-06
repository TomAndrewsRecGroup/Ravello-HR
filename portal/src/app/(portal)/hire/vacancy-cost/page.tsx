import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import VacancyCostClient from './VacancyCostClient';

export const metadata: Metadata = { title: 'Vacancy Cost Calculator' };

export default async function VacancyCostPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;

  let roles: any[] = [];
  if (companyId) {
    const { data } = await supabase
      .from('requisitions')
      .select('id, title, department, salary_range, created_at, stage, friction_score, friction_level, location, seniority')
      .eq('company_id', companyId)
      .not('stage', 'in', '("filled","cancelled")')
      .order('created_at', { ascending: false });
    roles = data ?? [];
  }

  return (
    <main className="portal-page flex-1">
      <VacancyCostClient roles={roles} />
    </main>
  );
}
