import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import LearningDetailClient from './LearningDetailClient';

export const metadata: Metadata = { title: 'Learning Content' };
export const revalidate = 60;

// Tag-similarity score (server-side)
function tagScore(a: string[] | null, b: string[] | null): number {
  if (!a || !b) return 0;
  const setB = new Set(b.map(t => t.toLowerCase()));
  return a.filter(t => setB.has(t.toLowerCase())).length;
}

export default async function LearningDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  const [{ data: content }, { data: allContent }, { data: purchase }] = await Promise.all([
    supabase
      .from('learning_content')
      .select('id,title,description,category,content_type,creator_name,file_url,thumbnail_url,duration_mins,price_pence,stripe_price_id,tags,is_featured,view_count,created_at')
      .eq('id', params.id)
      .eq('is_published', true)
      .single(),
    supabase
      .from('learning_content')
      .select('id,title,description,category,content_type,creator_name,file_url,thumbnail_url,duration_mins,price_pence,stripe_price_id,tags,is_featured,view_count')
      .eq('is_published', true)
      .neq('id', params.id)
      .limit(100),
    companyId
      ? supabase
          .from('learning_purchases')
          .select('id,status,access_expires_at,created_at')
          .eq('content_id', params.id)
          .eq('company_id', companyId)
          .eq('status', 'active')
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!content) notFound();

  const hasAccess = purchase && (!purchase.access_expires_at || new Date(purchase.access_expires_at) > new Date());

  // "You May Like": tag similarity, top 5
  const related = (allContent ?? [])
    .map(c => ({ c, score: tagScore(content.tags, c.tags) + (c.category === content.category ? 1 : 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ c }) => c);

  // "More From This Coach": same creator, top 4
  const byCreator = content.creator_name
    ? (allContent ?? [])
        .filter(c => c.creator_name === content.creator_name)
        .slice(0, 4)
    : [];

  return (
      <main className="portal-page flex-1">
        <LearningDetailClient
          content={content}
          related={related}
          byCreator={byCreator}
          purchase={purchase}
          hasAccess={!!hasAccess}
          companyId={companyId ?? ''}
          userId={user.id}
        />
      </main>
  );
}
