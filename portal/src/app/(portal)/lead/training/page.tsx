import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import TrainingNeedsClient from './TrainingNeedsClient';

export const metadata: Metadata = { title: 'Training Needs' };

export default async function TrainingNeedsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

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
