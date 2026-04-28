import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import AdminTopbar from '@/components/layout/AdminTopbar';
import UsersClient from './UsersClient';

export const metadata: Metadata = { title: 'Users' };
// No cache — admin staff need to see freshly-onboarded users
// immediately, not 30 seconds later. The page is staff-only via the
// (admin) layout's role gate, so there's no perf concern from
// rendering it dynamic.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_CAP = 500;

// Service-role read — bypasses RLS so the list always matches the
// dashboard count, regardless of session-cookie state. The (admin)
// layout already enforces tps_admin access; no point evaluating RLS
// a second time inside the page.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function UsersPage() {
  const sb = adminClient();
  const [{ data: users }, { count: totalUsers }] = await Promise.all([
    sb.from('profiles')
      .select('id,email,full_name,role,company_id,created_at,companies(id,name)')
      .neq('role', 'tps_admin')
      .order('created_at', { ascending: false })
      .limit(PAGE_CAP),
    sb.from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'tps_admin'),
  ]);

  const rows = users ?? [];
  const grand = totalUsers ?? rows.length;
  const isCapped = grand > PAGE_CAP;

  return (
    <>
      <AdminTopbar
        title="Users"
        subtitle={
          isCapped
            ? `Showing ${rows.length} most recent of ${grand} client accounts`
            : `${grand} client accounts`
        }
      />
      <main className="admin-page flex-1">
        <UsersClient users={rows} />
      </main>
    </>
  );
}
