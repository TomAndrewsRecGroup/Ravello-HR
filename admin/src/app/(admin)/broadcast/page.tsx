import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BroadcastClient from './BroadcastClient';
import RecentBroadcasts from './RecentBroadcasts';

export const metadata: Metadata = { title: 'Broadcast' };
export const dynamic = 'force-dynamic';

// Service-role read so the lists are always live (bypasses RLS,
// admin-only page anyway).
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function BroadcastPage() {
  const sb = adminClient();

  // 1. Active companies for the picker
  // 2. Recent admin-broadcast actions, grouped client-side. We pull a
  //    healthy buffer (last 200 admin-created actions in the last
  //    90 days) and the client groups by title+created_at-second so
  //    a 50-company broadcast collapses to one row.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const [companiesRes, actionsRes] = await Promise.all([
    sb.from('companies').select('id, slug, name, active').order('name'),
    sb.from('actions')
      .select('id, title, description, action_type, priority, due_date, created_at, company_id, companies(id, slug, name)')
      .eq('created_by_admin', true)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  return (
    <>
      <AdminTopbar
        title="Broadcast"
        subtitle="Send an action item to multiple clients at once"
      />
      <main className="admin-page flex-1 space-y-6">
        <BroadcastClient companies={companiesRes.data ?? []} />
        <RecentBroadcasts actions={(actionsRes.data ?? []) as any} />
      </main>
    </>
  );
}
