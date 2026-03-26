import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import LearningDetailClient from './LearningDetailClient';

export const metadata: Metadata = { title: 'Learning Content' };

export default async function LearningDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;

  const [{ data: content }, { data: purchase }] = await Promise.all([
    supabase.from('learning_content').select('*').eq('id', params.id).eq('is_published', true).single(),
    companyId
      ? supabase.from('learning_purchases').select('*').eq('content_id', params.id).eq('company_id', companyId).eq('status', 'active').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!content) notFound();

  const hasAccess = purchase && (!purchase.access_expires_at || new Date(purchase.access_expires_at) > new Date());

  return (
    <>
      <Topbar title={content.title} subtitle={content.creator_name ?? ''} />
      <main className="portal-page flex-1">
        <LearningDetailClient
          content={content}
          purchase={purchase}
          hasAccess={!!hasAccess}
          companyId={companyId ?? ''}
          userId={user.id}
        />
      </main>
    </>
  );
}
