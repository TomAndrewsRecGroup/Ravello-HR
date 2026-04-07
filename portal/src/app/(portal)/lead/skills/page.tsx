import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import SkillsMatrixClient from './SkillsMatrixClient';

export const metadata: Metadata = { title: 'Skills Matrix' };
export const revalidate = 60;

export default async function SkillsMatrixPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (!companyId) return (
    <main className="portal-page flex-1">
      <div className="card p-12 text-center">
        <div className="empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
        </div>
      </div>
    </main>
  );

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
