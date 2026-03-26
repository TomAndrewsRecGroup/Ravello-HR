import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import LearningBrowse from './LearningBrowse';

export const metadata: Metadata = { title: 'Learning' };

export default async function LearningPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;

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
    <>
      <Topbar title="Learning" subtitle="Browse and access HR learning content" />
      <main className="portal-page flex-1">
        <LearningBrowse
          content={content ?? []}
          purchases={purchases ?? []}
          companyId={companyId ?? ''}
          userId={user.id}
        />
      </main>
    </>
  );
}
