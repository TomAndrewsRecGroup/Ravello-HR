import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import LearningBrowse from './LearningBrowse';

export const metadata: Metadata = { title: 'Learning' };
export const revalidate = 60;

export default async function LearningPage() {
  const supabase = await createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');

  const [{ data: content }, { data: purchases }, { data: myPerson }] = await Promise.all([
    supabase
      .from('learning_content')
      .select('id,title,description,category,content_type,creator_name,file_url,thumbnail_url,duration_mins,price_pence,tags,is_featured,view_count')
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
    supabase.from('people').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  // "Assigned to you" — real LMS assignment/progress tracking, distinct
  // from the company-wide purchase window above (lib/.../learning_assignments,
  // migration 202). Fetched by this viewer's own person_id, never a
  // blind filter on a table RLS would otherwise widen for a manager.
  const { data: myAssignments } = myPerson
    ? await supabase.from('learning_assignments')
        .select('id, content_id, status, progress_percent, due_date')
        .eq('person_id', myPerson.id)
        .order('due_date', { nullsFirst: false })
        .limit(500)
    : { data: null };

  return (
      <main className="portal-page flex-1">
        <LearningBrowse
          content={content ?? []}
          purchases={purchases ?? []}
          assignments={myAssignments ?? []}
          companyId={companyId ?? ''}
          userId={user.id}
        />
      </main>
  );
}
