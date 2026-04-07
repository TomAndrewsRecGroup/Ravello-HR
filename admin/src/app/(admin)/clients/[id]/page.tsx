import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientDetailTabs from './ClientDetailTabs';

export const metadata: Metadata = { title: 'Client Detail' };
export const revalidate = 30;

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  // Only fetch data needed for Overview tab + stats — other tabs lazy-load via API
  const [
    { data: company },
    { data: users },
    { data: reqs },
    { data: tickets },
  ] = await Promise.all([
    supabase.from('companies').select('id,name,slug,sector,size_band,contact_email,active,feature_flags,manatal_client_id,account_owner,open_days,open_hours,timezone,currency').eq('id', params.id).single(),
    supabase.from('profiles').select('id,email,full_name,role,created_at').eq('company_id', params.id).order('created_at'),
    supabase.from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,friction_score,friction_level,assigned_recruiter,created_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('tickets').select('id,subject,status,priority').eq('company_id', params.id).neq('status', 'closed'),
  ]);

  if (!company) notFound();

  const c = company as any;

  const activeRoles = (reqs ?? []).filter((r: any) => !['filled', 'cancelled'].includes(r.stage)).length;
  const ticketCount = (tickets ?? []).length;

  return (
    <>
      <AdminTopbar
        title={c.name}
        subtitle={[c.sector, c.size_band].filter(Boolean).join(' · ')}
        actions={<Link href="/clients" className="btn-secondary btn-sm">← All Clients</Link>}
      />
      <main className="admin-page flex-1">
        <ClientDetailTabs
          company={c}
          users={users ?? []}
          reqs={reqs ?? []}
          stats={{ activeRoles, docsCount: 0, ticketCount }}
        />
      </main>
    </>
  );
}
