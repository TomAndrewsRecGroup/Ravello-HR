import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import AdminNewRoleForm from './AdminNewRoleForm';

export const metadata: Metadata = { title: 'New Role' };

export default async function AdminNewRolePage({
  searchParams,
}: {
  searchParams?: { template?: string; company_id?: string };
}) {
  const supabase = createServerSupabaseClient();

  const templateId          = searchParams?.template   ?? null;
  const presetCompanyId     = searchParams?.company_id ?? null;

  // The full template list is fetched here rather than client-side (as
  // the portal does) so it arrives with the page — a server component
  // already reading three tables can read a fourth in the same round.
  const [{ data: { user } }, { data: companies }, { data: tpoStaff }, { data: templates }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('companies').select('id,name').eq('active', true).order('name'),
    supabase.from('profiles').select('id,full_name').eq('role', 'tps_admin').order('full_name'),
    supabase.from('jd_templates').select('id,title,department,seniority,working_model,description,must_haves,benefits,tags').order('title'),
  ]);

  // `?template=` still pre-fills, so links from the Templates page keep
  // working; the dropdown is an additional way in, not a replacement.
  const template = (templates ?? []).find(t => t.id === templateId) ?? null;

  return (
    <>
      <AdminTopbar
        title="New Role"
        subtitle="Create a role on behalf of a client: Friction Lens runs automatically"
        actions={
          <div className="flex items-center gap-2">
            <Link prefetch={false} href="/hiring/templates" className="btn-secondary btn-sm">JD Templates</Link>
            <Link prefetch={false} href="/hiring" className="btn-ghost btn-sm">← All Roles</Link>
          </div>
        }
      />
      <main className="admin-page flex-1">
        <AdminNewRoleForm
          companies={companies ?? []}
          adminUserId={user?.id ?? ''}
          template={template}
          templates={templates ?? []}
          recruiters={(tpoStaff ?? []).map(s => s.full_name).filter(Boolean)}
          presetCompanyId={presetCompanyId}
        />
      </main>
    </>
  );
}
