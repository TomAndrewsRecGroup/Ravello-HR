import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import AdminNewRoleForm from './AdminNewRoleForm';

export const metadata: Metadata = { title: 'New Role' };

export default async function AdminNewRolePage() {
  const supabase = createServerSupabaseClient();

  const [{ data: { user } }, { data: companies }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('companies')
      .select('id,name')
      .eq('active', true)
      .order('name'),
  ]);

  return (
    <>
      <AdminTopbar
        title="New Role"
        subtitle="Create a role on behalf of a client — Friction Lens runs automatically"
        actions={<Link href="/hiring" className="btn-secondary btn-sm">← All Roles</Link>}
      />
      <main className="admin-page flex-1">
        <AdminNewRoleForm
          companies={companies ?? []}
          adminUserId={user?.id ?? ''}
        />
      </main>
    </>
  );
}
