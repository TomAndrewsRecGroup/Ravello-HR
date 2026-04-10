import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import AdminNewRoleForm from './AdminNewRoleForm';

export const metadata: Metadata = { title: 'New Role' };

export default async function AdminNewRolePage({
  searchParams,
}: {
  searchParams?: { template?: string };
}) {
  const supabase = createServerSupabaseClient();

  const templateId = searchParams?.template ?? null;

  const [{ data: { user } }, { data: companies }, { data: tpoStaff }, templateResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('companies').select('id,name').eq('active', true).order('name'),
    supabase.from('profiles').select('id,full_name').in('role', ['tps_admin', 'tps_client']).order('full_name'),
    templateId
      ? supabase.from('jd_templates').select('*').eq('id', templateId).single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <AdminTopbar
        title="New Role"
        subtitle="Create a role on behalf of a client — Friction Lens runs automatically"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/hiring/templates" className="btn-secondary btn-sm">JD Templates</Link>
            <Link href="/hiring" className="btn-ghost btn-sm">← All Roles</Link>
          </div>
        }
      />
      <main className="admin-page flex-1">
        <AdminNewRoleForm
          companies={companies ?? []}
          adminUserId={user?.id ?? ''}
          template={templateResult?.data ?? null}
          recruiters={(tpoStaff ?? []).map(s => s.full_name).filter(Boolean)}
        />
      </main>
    </>
  );
}
