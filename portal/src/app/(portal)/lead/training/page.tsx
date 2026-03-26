import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import TrainingNeedsClient from './TrainingNeedsClient';

export const metadata: Metadata = { title: 'Training Needs' };

export default async function TrainingNeedsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const { data: needs } = await supabase
    .from('training_needs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  return (
    <>
      <Topbar title="Training Needs" subtitle="Flag skill gaps and track L&D plans" />
      <main className="portal-page flex-1">
        <TrainingNeedsClient companyId={companyId} userId={user.id} initialNeeds={needs ?? []} />
      </main>
    </>
  );
}
