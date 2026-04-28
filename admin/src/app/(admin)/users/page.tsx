import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import AdminTopbar from '@/components/layout/AdminTopbar';
import UsersClient from './UsersClient';

export const metadata: Metadata = { title: 'Users' };
// No cache — admin staff need to see freshly-onboarded users
// immediately. The page is staff-only via the (admin) layout's
// role gate, so there's no perf concern from rendering it dynamic.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_CAP = 500;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface UserRow {
  id:         string;
  email:      string;
  full_name:  string | null;
  role:       string;
  company_id: string | null;
  created_at: string;
  companies:  { id: string; name: string } | null;
}

export default async function UsersPage() {
  const sb = adminClient();

  // Two parallel queries — DON'T use a PostgREST embed for the
  // company join. The embed silently returned null on this DB and
  // the page rendered the empty state. Fetching profiles + the
  // small set of companies separately and merging in JS is more
  // reliable and the perf cost is trivial (one extra round trip).
  const [usersRes, countRes, companiesRes] = await Promise.all([
    sb.from('profiles')
      .select('id, email, full_name, role, company_id, created_at')
      .neq('role', 'tps_admin')
      .order('created_at', { ascending: false })
      .limit(PAGE_CAP),
    sb.from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'tps_admin'),
    sb.from('companies').select('id, name'),
  ]);

  // Surface query errors to server logs so a future regression doesn't
  // silently render "No users yet" again.
  if (usersRes.error)     console.error('[/users] profiles list query failed:',     usersRes.error.message);
  if (countRes.error)     console.error('[/users] profiles count query failed:',    countRes.error.message);
  if (companiesRes.error) console.error('[/users] companies lookup query failed:',  companiesRes.error.message);

  const companyMap = new Map<string, { id: string; name: string }>();
  for (const c of companiesRes.data ?? []) companyMap.set(c.id, c);

  const rows: UserRow[] = (usersRes.data ?? []).map(u => ({
    ...u,
    companies: u.company_id ? companyMap.get(u.company_id) ?? null : null,
  }));

  const grand    = countRes.count ?? rows.length;
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
