import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ClientDetailTabs from './ClientDetailTabs';

export const metadata: Metadata = { title: 'Client Detail' };

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const [
    { data: company },
    { data: users },
    { data: reqs },
    { data: documents },
    { data: milestones },
    { data: services },
    { data: tickets },
  ] = await Promise.all([
    supabase.from('companies').select('*').eq('id', params.id).single(),
    supabase.from('profiles').select('*').eq('company_id', params.id).order('created_at'),
    supabase.from('requisitions').select('*').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('documents').select('*').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('milestones').select('*').eq('company_id', params.id).order('due_date', { ascending: true }),
    supabase.from('client_services').select('*').eq('company_id', params.id).order('start_date', { ascending: false }),
    supabase.from('tickets').select('id,subject,status,priority').eq('company_id', params.id).neq('status', 'closed'),
  ]);

  if (!company) notFound();

  const c = company as any;

  const activeRoles = (reqs ?? []).filter((r: any) => !['filled', 'cancelled'].includes(r.stage)).length;
  const docsCount   = (documents ?? []).length;
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
          documents={documents ?? []}
          milestones={milestones ?? []}
          services={services ?? []}
          stats={{ activeRoles, docsCount, ticketCount }}
        />
      </main>
    </>
  );
}
