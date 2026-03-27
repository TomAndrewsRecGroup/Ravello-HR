import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import ClientsClient from './ClientsClient';

export const metadata: Metadata = { title: 'Clients' };
export const revalidate = 30;

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient();

  const [
    { data: companies },
    { data: reqs },
    { data: tickets },
    { data: complianceItems },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('requisitions').select('company_id,stage').neq('stage', 'filled').neq('stage', 'cancelled'),
    supabase.from('tickets').select('company_id,status').in('status', ['open', 'in_progress']),
    supabase.from('compliance_items').select('company_id,status,due_date').neq('status', 'complete'),
    supabase.from('profiles').select('id,full_name,email,role,created_at,company_id').in('role', ['client_admin', 'client_viewer', 'client_user']),
  ]);

  // Build per-company lookup maps
  const activeRolesMap: Record<string, number> = {};
  const openTicketsMap: Record<string, number> = {};
  const overdueCompMap: Record<string, number> = {};
  const usersByCompany: Record<string, any[]>  = {};

  for (const r of reqs ?? []) {
    activeRolesMap[r.company_id] = (activeRolesMap[r.company_id] ?? 0) + 1;
  }
  for (const t of tickets ?? []) {
    openTicketsMap[t.company_id] = (openTicketsMap[t.company_id] ?? 0) + 1;
  }
  const now = new Date();
  for (const c of complianceItems ?? []) {
    if (c.due_date && new Date(c.due_date) < now) {
      overdueCompMap[c.company_id] = (overdueCompMap[c.company_id] ?? 0) + 1;
    }
  }
  for (const p of profiles ?? []) {
    if (!usersByCompany[p.company_id]) usersByCompany[p.company_id] = [];
    usersByCompany[p.company_id].push(p);
  }

  const all           = companies ?? [];
  const activeCount   = all.filter((c: any) => c.active).length;
  const inactiveCount = all.filter((c: any) => !c.active).length;

  return (
    <>
      <AdminTopbar
        title="Clients"
        subtitle={`${activeCount} active, ${inactiveCount} inactive`}
        actions={<Link href="/clients/new" className="btn-cta btn-sm flex items-center gap-1.5"><Plus size={13} />New Client</Link>}
      />
      <main className="admin-page flex-1">
        <ClientsClient
          companies={all}
          usersByCompany={usersByCompany}
          activeRolesMap={activeRolesMap}
          openTicketsMap={openTicketsMap}
          overdueCompMap={overdueCompMap}
        />
      </main>
    </>
  );
}
