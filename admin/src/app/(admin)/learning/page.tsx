import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import LearningAdminClient from './LearningAdminClient';

export const metadata: Metadata = { title: 'Learning Content' };
export const revalidate = 60;

export default async function LearningAdminPage() {
  const supabase = createServerSupabaseClient();

  const { data: content } = await supabase
    .from('learning_content')
    .select('id,title,description,category,content_type,creator_name,file_url,thumbnail_url,duration_mins,price_pence,stripe_price_id,tags,is_published,is_featured,view_count,created_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  return (
    <>
      <AdminTopbar title="Learning Content" subtitle="Manage e-learning content for the marketplace" />
      <main className="admin-page flex-1">
        <LearningAdminClient initialContent={content ?? []} />
      </main>
    </>
  );
}
