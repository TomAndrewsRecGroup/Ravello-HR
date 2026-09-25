import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsDocument, HsFile } from '@/lib/hs/types';
import DocumentsClient from '@/components/hs/DocumentsClient';

export const metadata: Metadata = { title: 'H&S documents' };
export const dynamic = 'force-dynamic';

// The client's H&S document library: policies, RAMS, COSHH data
// sheets and other paperwork. Metadata is hs_documents; the actual
// file is evidence in hs_files (entity_type 'document'), the same
// bucket and path shape every other piece of H&S evidence uses.
export default async function HealthSafetyDocumentsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [documents, files] = await Promise.all([
    readAllPages<HsDocument>((from, to) =>
      supabase.from('hs_documents')
        .select('id, company_id, site_id, category, title, description, version, review_due_at, status, supersedes_id, created_at, updated_at')
        .eq('company_id', params.companyId)
        .order('status', { ascending: true })
        .order('review_due_at', { ascending: true, nullsFirst: false })
        .order('id')
        .range(from, to)),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .eq('entity_type', 'document')
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
  ]);

  return (
    <DocumentsClient
      companyId={params.companyId}
      documents={documents.rows}
      files={files.rows}
      loadError={documents.error ?? files.error ?? (documents.truncated ? 'Showing the first part of a very long document library.' : null)}
    />
  );
}
