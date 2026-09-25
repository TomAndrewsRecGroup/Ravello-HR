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

// A ?update=<latest_updates id> query param (the link on a
// "regulatory_change_detected" staff notification — see
// lib/latestUpdates/classify.ts) pre-fills the compose form and
// pre-selects every client whose own register already holds an item in
// the category Jev suggested. Nothing about that classification is
// trusted further than a prefill: the staff member reviews and edits
// before pressing Send, exactly as any other broadcast.
async function loadPrefill(sb: ReturnType<typeof adminClient>, updateId: string | undefined) {
  if (!updateId) return null;
  const { data: update } = await sb.from('latest_updates')
    .select('id, title, description, regulatory_category').eq('id', updateId).maybeSingle();
  if (!update || !update.regulatory_category || update.regulatory_category === 'none') return null;
  const { data: items } = await sb.from('compliance_items').select('company_id').eq('category', update.regulatory_category);
  const companyIds = [...new Set((items ?? []).map((i: { company_id: string }) => i.company_id))];
  return {
    title: `Regulatory update: ${update.title}`.slice(0, 200),
    description: update.description ?? '',
    companyIds,
  };
}

export default async function BroadcastPage(props: { searchParams: Promise<{ update?: string }> }) {
  const searchParams = await props.searchParams;
  const sb = adminClient();

  // 1. Active companies for the picker
  // 2. Recent admin-broadcast actions, grouped client-side. We pull a
  //    healthy buffer (last 200 admin-created actions in the last
  //    90 days) and the client groups by title+created_at-second so
  //    a 50-company broadcast collapses to one row.
  // 3. A prefill from a regulatory-change suggestion, when linked here.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const [companiesRes, actionsRes, prefill] = await Promise.all([
    sb.from('companies').select('id, slug, name, active').order('name'),
    sb.from('actions')
      .select('id, title, description, action_type, priority, due_date, created_at, company_id, companies(id, slug, name)')
      .eq('created_by_admin', true)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200),
    loadPrefill(sb, searchParams?.update),
  ]);

  return (
    <>
      <AdminTopbar
        title="Broadcast"
        subtitle="Send an action item to multiple clients at once"
      />
      <main className="admin-page flex-1 space-y-6">
        <BroadcastClient companies={companiesRes.data ?? []} prefill={prefill} />
        <RecentBroadcasts actions={(actionsRes.data ?? []) as any} />
      </main>
    </>
  );
}
