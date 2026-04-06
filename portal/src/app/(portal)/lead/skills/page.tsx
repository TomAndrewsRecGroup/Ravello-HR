import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import SkillsMatrixClient from './SkillsMatrixClient';

export const metadata: Metadata = { title: 'Skills Matrix' };

export default async function SkillsMatrixPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

  const { data: skills } = await supabase
    .from('skills_matrix')
    .select('*')
    .eq('company_id', companyId)
    .order('employee_name', { ascending: true });

  return (
      <main className="portal-page flex-1">
        <SkillsMatrixClient companyId={companyId} initialSkills={skills ?? []} />
      </main>
  );
}
