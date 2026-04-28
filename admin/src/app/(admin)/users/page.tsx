import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import UsersClient from './UsersClient';

export const metadata: Metadata = { title: 'Users' };
export const revalidate = 30;

// Cap on initial fetch — see /candidates/page.tsx for the same pattern.
const PAGE_CAP = 500;

export default async function UsersPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: users }, { count: totalUsers }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,role,company_id,created_at,companies(id,name)')
      // Match the count query below — list and count must agree, otherwise
      // the subtitle says "1 client account" while the row shows a TPS
      // staff member.
      .neq('role', 'tps_admin')
      .order('created_at', { ascending: false })
      .limit(PAGE_CAP),
    supabase
      .from('profiles')
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
