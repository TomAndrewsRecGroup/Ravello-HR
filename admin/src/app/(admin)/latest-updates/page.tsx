import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import LatestUpdatesClient, { type UpdateRow } from './LatestUpdatesClient';

export const metadata: Metadata = { title: 'Latest Updates' };

export default async function LatestUpdatesAdminPage() {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('latest_updates')
    .select('id, source_type, source_url, title, description, image_url, site_name, published_at, render_mode, embed_html, status, featured, featured_order, created_at')
    .order('featured', { ascending: false })
    .order('featured_order', { ascending: true, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <AdminTopbar
        title="Latest Updates"
        subtitle="Paste a URL to add it to the marketing site feed. Feature posts to show them in the top carousel."
      />
      <main className="admin-page flex-1">
        <LatestUpdatesClient initial={(data ?? []) as UpdateRow[]} />
      </main>
    </>
  );
}
