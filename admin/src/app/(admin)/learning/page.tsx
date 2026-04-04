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
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <>
      <AdminTopbar title="Learning Content" subtitle="Manage e-learning content for the marketplace" />
      <main className="admin-page flex-1">
        <LearningAdminClient initialContent={content ?? []} />
      </main>
    </>
  );
}
