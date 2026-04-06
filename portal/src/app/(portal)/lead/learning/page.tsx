import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import LearningBrowse from './LearningBrowse';

export const metadata: Metadata = { title: 'Learning' };

export default async function LearningPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  const [{ data: content }, { data: purchases }] = await Promise.all([
    supabase
      .from('learning_content')
      .select('*')
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false }),
    companyId
      ? supabase
          .from('learning_purchases')
          .select('content_id, status, access_expires_at')
          .eq('company_id', companyId)
          .in('status', ['active', 'pending'])
      : Promise.resolve({ data: [] }),
  ]);

  return (
      <main className="portal-page flex-1">
        <LearningBrowse
          content={content ?? []}
          purchases={purchases ?? []}
          companyId={companyId ?? ''}
          userId={user.id}
        />
      </main>
  );
}
