import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { EMPLOYEE_SAFE_COLUMNS } from '@/lib/lead/employeePrivate';
import GenerateDocumentClient from './GenerateDocumentClient';
import type { DocumentTemplate } from '@/lib/documentTemplates/types';

export const metadata: Metadata = { title: 'Generate Document' };

export default async function GenerateDocumentPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template: templateId } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { user, companyId, companyName, role, isTpsStaff } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (!isCompanySuperUser({ role, isTpsStaff })) redirect('/lead/document-templates');
  if (!templateId) redirect('/lead/document-templates');

  const [{ data: template }, { data: employees }] = await Promise.all([
    supabase
      .from('document_templates')
      .select('id,title,category,description,body,merge_fields,requires_signature,is_example,status,supersedes_id,created_by,created_at,updated_at')
      .eq('id', templateId)
      .maybeSingle(),
    supabase
      .from('employee_records')
      .select(EMPLOYEE_SAFE_COLUMNS)
      .eq('company_id', companyId)
      .is('end_date', null)
      .order('full_name')
      .limit(500),
  ]);

  if (!template) notFound();

  return (
    <main className="portal-page flex-1">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>Generate: {template.title}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
            Pick an employee, fill in anything the template still needs, then save a draft or send it for signature.
          </p>
        </div>
        <Link prefetch={false} href="/lead/document-templates" className="btn-ghost btn-sm">← Templates</Link>
      </div>
      <GenerateDocumentClient
        template={template as DocumentTemplate}
        employees={(employees ?? []) as Record<string, unknown>[]}
        companyId={companyId}
        companyName={companyName ?? ''}
        templatesHref="/lead/document-templates"
        sendEndpointBase="/api/lead/document-templates"
      />
    </main>
  );
}
