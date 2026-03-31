import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SkillsMatrixClient from './SkillsMatrixClient';

export const metadata: Metadata = { title: 'Skills Matrix' };

export default async function SkillsMatrixPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
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
