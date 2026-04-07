import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import ValueReportClient from './ValueReportClient';

export const metadata: Metadata = { title: 'Client Value Reports' };
export const revalidate = 60;

export default async function ValueReportsPage() {
  const supabase = createServerSupabaseClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  const [compRes, reqRes, candRes, ticketRes, docRes, complianceRes, servReqRes, actionsRes, loginRes, servicesRes] = await Promise.all([
    supabase.from('companies').select('id, name, active, contact_email').eq('active', true).order('name'),
    supabase.from('requisitions').select('id, company_id, title, stage, created_at, updated_at'),
    supabase.from('candidates').select('id, company_id, full_name, client_status, created_at'),
    supabase.from('tickets').select('id, company_id, subject, status, priority, created_at, resolved_at'),
    supabase.from('documents').select('id, company_id, name, created_at'),
    supabase.from('compliance_items').select('id, company_id, title, status, created_at'),
    supabase.from('service_requests').select('id, company_id, subject, status, created_at, responded_at'),
    supabase.from('actions').select('id, company_id, title, status, created_at, completed_at'),
    supabase.from('profiles').select('id, company_id, role').not('role', 'in', '("tps_admin","tps_client")'),
    supabase.from('client_services').select('id, company_id, service_name, monthly_fee, status').eq('status', 'active'),
  ]);

  return (
    <>
      <AdminTopbar title="Client Value Reports" subtitle="Generate monthly reports showing what TPS delivered" />
      <main className="admin-page flex-1">
        <ValueReportClient
          companies={compRes.data ?? []}
          requisitions={reqRes.data ?? []}
          candidates={candRes.data ?? []}
          tickets={ticketRes.data ?? []}
          documents={docRes.data ?? []}
          complianceItems={complianceRes.data ?? []}
          serviceRequests={servReqRes.data ?? []}
          actions={actionsRes.data ?? []}
          profiles={loginRes.data ?? []}
          services={servicesRes.data ?? []}
        />
      </main>
    </>
  );
}
