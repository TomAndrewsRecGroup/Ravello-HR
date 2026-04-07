import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import RequestsClient from './RequestsClient';

export const metadata: Metadata = { title: 'Service Requests' };
export const revalidate = 30;

export default async function ServiceRequestsPage() {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('service_requests')
    .select('*, companies(name)')
    .order('created_at', { ascending: false });

  const requests: any[] = data ?? [];

  return (
    <>
      <AdminTopbar
        title="Service Requests"
        subtitle="Incoming requests from all clients"
      />
      <main className="admin-page flex-1">
        <RequestsClient requests={requests} />
      </main>
    </>
  );
}
