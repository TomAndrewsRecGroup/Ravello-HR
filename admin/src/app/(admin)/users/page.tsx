import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import UsersClient from './UsersClient';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const supabase = createServerSupabaseClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('*, companies(id,name)')
    .order('created_at', { ascending: false });

  return (
    <>
      <AdminTopbar
        title="Users"
        subtitle={`${(users ?? []).length} accounts`}
      />
      <main className="admin-page flex-1">
        <UsersClient users={users ?? []} />
      </main>
    </>
  );
}
