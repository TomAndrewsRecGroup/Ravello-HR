import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import InstancesClient from './InstancesClient';
import type { DocumentInstance } from '@/lib/documentTemplates/types';

export const metadata: Metadata = { title: 'Sent Documents' };
export const dynamic = 'force-dynamic';

// Cross-client tracking for every document a template has ever
// generated (Part 2, Group 6). Staff holds document_instances_staff_all
// (FOR ALL, no company_id restriction), so this is the one place to
// see every sent/signed/declined/voided document across every client,
// not just the one a staff member happens to have open.
export default async function DocumentInstancesPage() {
  const supabase = await createServerSupabaseClient();

  const { data: instances } = await supabase
    .from('document_instances')
    .select('id,company_id,template_id,employee_id,category,rendered_title,rendered_body,merge_values,requires_signature,status,storage_path,created_by,sent_for_signature_at,signed_at,signed_by_name,signed_ip,signed_user_agent,declined_at,declined_reason,voided_at,voided_by,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (instances ?? []) as DocumentInstance[];

  // Fetch by id list, never a chained embed — the standing "PostgREST
  // cannot join two tables through a third they both merely reference"
  // rule this codebase has followed since the referral PATCH route's
  // own PGRST200 lesson.
  const employeeIds = [...new Set(rows.map(r => r.employee_id))];
  const companyIds  = [...new Set(rows.map(r => r.company_id))];

  const [{ data: employees }, { data: companies }] = await Promise.all([
    employeeIds.length
      ? supabase.from('employee_records').select('id, full_name, email').in('id', employeeIds).limit(500)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string | null }[] }),
    companyIds.length
      ? supabase.from('companies').select('id, name').in('id', companyIds).limit(500)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const employeeNames = Object.fromEntries((employees ?? []).map(e => [e.id, e.full_name])) as Record<string, string>;
  const companyNames  = Object.fromEntries((companies ?? []).map(c => [c.id, c.name])) as Record<string, string>;

  return (
    <>
      <AdminTopbar
        title="Sent Documents"
        subtitle="Every contract/letter generated from a template, across every client — track, resend or cancel"
      />
      <main className="admin-page flex-1">
        <InstancesClient initialInstances={rows} employeeNames={employeeNames} companyNames={companyNames} />
      </main>
    </>
  );
}
