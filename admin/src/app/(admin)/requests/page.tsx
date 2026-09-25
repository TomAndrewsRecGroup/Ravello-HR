import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import RequestsClient from './RequestsClient';

export const metadata: Metadata = { title: 'Support & Requests' };
export const revalidate = 30;

export default async function ServiceRequestsPage() {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('service_requests')
    .select('id,subject,request_type,status,urgency,priority,details,response_notes,responded_at,created_at,assigned_to,first_response_at,sla_due_at,triage,companies(name)')
    .order('created_at', { ascending: false })
    .limit(500);

  const requests: any[] = data ?? [];

  return (
    <>
      <AdminTopbar
        title="Support & Requests"
        subtitle="Every query and request from every client, with the SLA clock and Jev's read"
      />
      <main className="admin-page flex-1">
        <RequestsClient requests={requests} />
      </main>
    </>
  );
}
