import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import ReviewsClient from './ReviewsClient';

export const metadata: Metadata = { title: 'Performance Reviews' };

export default async function PerformanceReviewsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const { data: reviews } = await supabase
    .from('performance_reviews')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  return (
    <>
      <Topbar title="Performance Reviews" subtitle="Manage review cycles and track completion" />
      <main className="portal-page flex-1">
        <ReviewsClient companyId={companyId} initialReviews={reviews ?? []} />
      </main>
    </>
  );
}
