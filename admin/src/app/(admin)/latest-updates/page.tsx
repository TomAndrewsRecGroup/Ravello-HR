import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import LatestUpdatesClient, { type UpdateRow } from './LatestUpdatesClient';
import FeedSourcesClient, { type FeedSourceRow } from './FeedSourcesClient';

export const metadata: Metadata = { title: 'Latest Updates' };
export const dynamic = 'force-dynamic';

export default async function LatestUpdatesAdminPage() {
  const supabase = createServerSupabaseClient();

  const [updatesRes, sourcesRes] = await Promise.all([
    supabase
      .from('latest_updates')
      .select('id, source_type, source_url, title, description, image_url, site_name, published_at, render_mode, embed_kind, embed_ref, status, featured, featured_order, created_at')
      .order('featured', { ascending: false })
      .order('featured_order', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('feed_sources')
      .select('id, slug, display_name, feed_url, source_type, category, active, last_fetched_at, last_error, created_at, scrape_config')
      .order('active', { ascending: false })
      .order('display_name', { ascending: true }),
  ]);

  return (
    <>
      <AdminTopbar
        title="Latest Updates"
        subtitle="Paste URLs or subscribe to RSS feeds. Feature posts to show them in the marketing-site carousel."
      />
      <main className="admin-page flex-1 space-y-8">
        <LatestUpdatesClient initial={(updatesRes.data ?? []) as UpdateRow[]} />
        <FeedSourcesClient initial={(sourcesRes.data ?? []) as FeedSourceRow[]} />
      </main>
    </>
  );
}
