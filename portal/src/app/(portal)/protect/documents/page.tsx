import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, Clock, FileText } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { HS_REGISTER_CATEGORY_LABELS } from '@/lib/hs/vocab';
import { daysUntil } from '@/lib/hs/recurrence';
import type { HsDocument, HsFile } from '@/lib/hs/types';
import EvidenceLinks from '@/components/hs/EvidenceLinks';

export const metadata: Metadata = { title: 'H&S Documents' };
export const dynamic = 'force-dynamic';

// The client's H&S document library, read-only — nothing here is
// self-certified, the same posture the register (compliance) page
// takes. Core OS 360 adds and replaces documents; the client reads
// and downloads them.

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

type Rag = 'red' | 'amber' | 'green' | 'none';
function ragFor(reviewDueAt: string | null): Rag {
  if (!reviewDueAt) return 'none';
  const d = daysUntil(reviewDueAt);
  if (d < 0) return 'red';
  if (d <= 30) return 'amber';
  return 'green';
}
const RAG: Record<Rag, { label: string; colour: string; icon: React.ElementType }> = {
  red:   { label: 'Review overdue',  colour: 'var(--danger)',    icon: AlertTriangle },
  amber: { label: 'Review due soon', colour: 'var(--amber)',     icon: Clock },
  green: { label: 'Reviewed',        colour: 'var(--success)',   icon: CheckCircle2 },
  none:  { label: 'No review date',  colour: 'var(--ink-faint)', icon: Clock },
};

export default async function ProtectDocumentsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [documents, files] = await Promise.all([
    readAllPages<HsDocument>((from, to) =>
      supabase.from('hs_documents')
        .select('id, company_id, site_id, category, title, description, version, review_due_at, status, supersedes_id, created_at, updated_at')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('review_due_at', { ascending: true, nullsFirst: false }).order('id')
        .range(from, to)),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', companyId)
        .eq('entity_type', 'document')
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
  ]);

  const items = documents.rows;
  const errorMsg = documents.error ?? files.error ?? (documents.truncated ? 'Showing the first part of a very long document library.' : null);

  return (
    <main className="portal-page flex-1 space-y-4">
      {errorMsg && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Could not load documents: {errorMsg}</p>}
      {items.length === 0 ? (
        <div className="card empty-state p-10">
          <FileText size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No H&amp;S documents have been added yet.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {items.map(doc => {
            const rag = ragFor(doc.review_due_at);
            const R = RAG[rag];
            const docFiles = files.rows.filter(f => f.entity_type === 'document' && f.entity_id === doc.id);
            return (
              <li key={doc.id} className="p-4">
                <div className="flex items-start gap-3">
                  <R.icon size={16} style={{ color: R.colour, flexShrink: 0, marginTop: 2 }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>
                      {doc.title} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>v{doc.version}</span>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {(HS_REGISTER_CATEGORY_LABELS as Record<string, string>)[doc.category] ?? doc.category}
                      {doc.review_due_at && ` · review due ${fmt(doc.review_due_at)}`}
                    </p>
                    {doc.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{doc.description}</p>}
                    <EvidenceLinks files={docFiles.map(f => ({ id: f.id, storage_path: f.storage_path, file_name: f.file_name }))} />
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap" style={{ color: R.colour }}>{R.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
