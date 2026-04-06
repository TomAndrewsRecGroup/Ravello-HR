import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import TrainingNeedsClient from './TrainingNeedsClient';

export const metadata: Metadata = { title: 'Training Needs' };

export default async function TrainingNeedsPage() {
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

  const { data: needs } = await supabase
    .from('training_needs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  return (
      <main className="portal-page flex-1">
        <TrainingNeedsClient companyId={companyId} userId={user.id} initialNeeds={needs ?? []} />
      </main>
  );
}
