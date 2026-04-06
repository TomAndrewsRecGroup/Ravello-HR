import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import ReviewsClient from './ReviewsClient';

export const metadata: Metadata = { title: 'Performance Reviews' };

export default async function PerformanceReviewsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

  const { data: reviews } = await supabase
    .from('performance_reviews')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  return (
      <main className="portal-page flex-1">
        <ReviewsClient companyId={companyId} initialReviews={reviews ?? []} />
      </main>
  );
}
