import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import DocumentTemplatesClient from './DocumentTemplatesClient';
import type { DocumentTemplate } from '@/lib/documentTemplates/types';

export const metadata: Metadata = { title: 'Document Templates' };
export const revalidate = 60;

export default async function DocumentTemplatesPage() {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('document_templates')
    .select('id,title,category,description,body,merge_fields,requires_signature,is_example,status,supersedes_id,created_by,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(500);

  return (
    <>
      <AdminTopbar
        title="Document Templates"
        subtitle="Contract and policy templates clients generate employee documents from, with native e-signing"
      />
      <main className="admin-page flex-1">
        <DocumentTemplatesClient initialTemplates={(data ?? []) as DocumentTemplate[]} />
      </main>
    </>
  );
}
