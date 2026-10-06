import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EMPLOYEE_SAFE_COLUMNS } from '@/lib/lead/employeePrivate';
import GenerateDocumentClient from './GenerateDocumentClient';
import type { DocumentTemplate } from '@/lib/documentTemplates/types';

export const metadata: Metadata = { title: 'Generate Document' };

export default async function AdminGenerateDocumentPage({
  searchParams,
}: { searchParams: Promise<{ template?: string; company?: string }> }) {
  const { template: templateId, company: companyId } = await searchParams;
  if (!templateId) redirect('/document-templates');

  const supabase = await createServerSupabaseClient();

  const { data: template } = await supabase
    .from('document_templates')
    .select('id,title,category,description,body,merge_fields,requires_signature,is_example,status,supersedes_id,created_by,created_at,updated_at')
    .eq('id', templateId)
    .maybeSingle();
  if (!template) notFound();

  // Which client this document is for — staff work across every
  // company, so (unlike the portal's own generate page, which already
  // knows the signed-in client's own company) this is picked explicitly
  // rather than inferred.
  if (!companyId) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id,name')
      .eq('active', true)
      .order('name')
      .limit(500);
    return (
      <>
        <AdminTopbar title={`Generate: ${template.title}`} subtitle="Choose which client this document is for" />
        <main className="admin-page flex-1">
          <form method="get" className="card p-5 max-w-md flex flex-col gap-3">
            <input type="hidden" name="template" value={templateId} />
            <label className="block">
              <span className="label">Client</span>
              <select name="company" className="input" required defaultValue="">
                <option value="" disabled>Choose a client…</option>
                {(companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="btn-cta" type="submit">Continue</button>
          </form>
        </main>
      </>
    );
  }

  const [{ data: company }, { data: employees }] = await Promise.all([
    supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle(),
    supabase
      .from('employee_records')
      .select(EMPLOYEE_SAFE_COLUMNS)
      .eq('company_id', companyId)
      .is('end_date', null)
      .order('full_name')
      .limit(500),
  ]);
  if (!company) notFound();

  return (
    <>
      <AdminTopbar title={`Generate: ${template.title}`} subtitle={`For ${company.name}`} />
      <main className="admin-page flex-1">
        <GenerateDocumentClient
          template={template as DocumentTemplate}
          employees={(employees ?? []) as Record<string, unknown>[]}
          companyId={company.id}
          companyName={company.name ?? ''}
          templatesHref="/document-templates"
          sendEndpointBase="/api/admin/document-templates"
        />
      </main>
    </>
  );
}
