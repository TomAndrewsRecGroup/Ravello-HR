'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { HS_REGISTER_CATEGORIES, HS_REGISTER_CATEGORY_LABELS, type HsRegisterCategory } from '@/lib/hs/vocab';
import { HS_EVIDENCE_ACCEPT, evidenceUrl, uploadEvidence } from '@/lib/hs/evidence';
import type { HsDocument, HsFile } from '@/lib/hs/types';

interface Props {
  companyId: string;
  documents: HsDocument[];
  files:     HsFile[];
  loadError: string | null;
}

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

type Rag = 'red' | 'amber' | 'green' | 'none';
function ragFor(reviewDueAt: string | null): Rag {
  if (!reviewDueAt) return 'none';
  const days = Math.floor((new Date(`${reviewDueAt}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}
const RAG: Record<Rag, { label: string; colour: string; icon: React.ElementType }> = {
  red:   { label: 'Review overdue', colour: 'var(--red)',       icon: AlertTriangle },
  amber: { label: 'Review due soon', colour: 'var(--gold)',     icon: Clock },
  green: { label: 'Reviewed',        colour: 'var(--teal)',     icon: CheckCircle2 },
  none:  { label: 'No review date',  colour: 'var(--ink-faint)', icon: Clock },
};

export default function DocumentsClient({ companyId, documents, files, loadError }: Props) {
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<HsDocument | null>(null);
  const active = documents.filter(d => d.status === 'active');
  const superseded = documents.filter(d => d.status === 'superseded');

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the document library: {loadError}</p>}

      <div className="flex items-center justify-end">
        <button className="btn-cta btn-sm" onClick={() => setAdding(a => !a)}>
          <Plus size={14} /> Add document
        </button>
      </div>

      {adding && <DocumentForm companyId={companyId} onDone={() => setAdding(false)} />}
      {replacing && (
        <DocumentForm
          companyId={companyId}
          supersedes={replacing}
          onDone={() => setReplacing(null)}
        />
      )}

      {active.length === 0 ? (
        <div className="card empty-state p-10">
          <FileText size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No H&amp;S documents for this client yet.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {active.map(doc => {
            const rag = ragFor(doc.review_due_at);
            const R = RAG[rag];
            const file = files.find(f => f.entity_type === 'document' && f.entity_id === doc.id);
            return (
              <li key={doc.id} className="p-4 flex items-start gap-3">
                <R.icon size={16} style={{ color: R.colour, flexShrink: 0, marginTop: 2 }} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="font-medium" style={{ color: 'var(--ink)' }}>
                    {doc.title} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>v{doc.version}</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {HS_REGISTER_CATEGORY_LABELS[doc.category as HsRegisterCategory] ?? doc.category}
                    {doc.review_due_at && ` · review due ${fmt(doc.review_due_at)}`}
                  </p>
                  {doc.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{doc.description}</p>}
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-xs font-medium" style={{ color: R.colour }}>{R.label}</span>
                  {file && <OpenFileButton storagePath={file.storage_path} />}
                  <button className="btn-secondary btn-sm" onClick={() => setReplacing(doc)}>
                    <RefreshCw size={13} /> New version
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {superseded.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--ink-soft)' }}>
            {superseded.length} superseded version{superseded.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
            {superseded.map(doc => {
              const file = files.find(f => f.entity_type === 'document' && f.entity_id === doc.id);
              return (
                <li key={doc.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--ink-faint)' }}>{doc.title} · v{doc.version} · superseded</span>
                  {file && <OpenFileButton storagePath={file.storage_path} />}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function OpenFileButton({ storagePath }: { storagePath: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const url = await evidenceUrl(createClient(), storagePath);
    setBusy(false);
    if (!url) { toast('Could not open the file.', 'error'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={open} disabled={busy}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Open
    </button>
  );
}

function DocumentForm({ companyId, supersedes, onDone }: { companyId: string; supersedes?: HsDocument; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(supersedes?.title ?? '');
  const [category, setCategory] = useState<HsRegisterCategory>((supersedes?.category as HsRegisterCategory) ?? 'hs_policy_governance');
  const [description, setDescription] = useState(supersedes?.description ?? '');
  const [reviewDueAt, setReviewDueAt] = useState(supersedes?.review_due_at ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast('Choose a file to upload.', 'error'); return; }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('hs_documents').insert({
      company_id: companyId, title: title.trim(), category,
      description: description.trim() || null, review_due_at: reviewDueAt || null,
      version: supersedes ? supersedes.version + 1 : 1,
      supersedes_id: supersedes?.id ?? null,
    }).select('id').single();
    if (error || !data) { setBusy(false); toast(error?.message ?? 'Could not save the document.', 'error'); return; }

    const problem = await uploadEvidence(supabase, { companyId, entityType: 'document', entityId: data.id, file });
    if (problem) { setBusy(false); toast(problem, 'error'); return; }

    if (supersedes) {
      const supRes = await supabase.from('hs_documents').update({ status: 'superseded' }, COUNT_EXACT).eq('id', supersedes.id);
      const outcome = judgeWrite(supRes, 'The previous version');
      if (!outcome.ok) toast(`Uploaded, but ${outcome.message?.charAt(0).toLowerCase()}${outcome.message?.slice(1)}`, 'error');
    }

    setBusy(false);
    toast(supersedes ? 'New version uploaded' : 'Document added', 'success');
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      {supersedes && (
        <p className="md:col-span-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
          Replacing <strong>{supersedes.title}</strong> (v{supersedes.version}). The old version is kept, marked superseded.
        </p>
      )}
      <label className="block md:col-span-2">
        <span className="label">Title</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Fire risk assessment" />
      </label>
      <label className="block">
        <span className="label">Category</span>
        <select className="input" value={category} onChange={e => setCategory(e.target.value as HsRegisterCategory)}>
          {HS_REGISTER_CATEGORIES.map(c => <option key={c} value={c}>{HS_REGISTER_CATEGORY_LABELS[c]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Review due (optional)</span>
        <input className="input" type="date" value={reviewDueAt} onChange={e => setReviewDueAt(e.target.value)} />
      </label>
      <label className="block md:col-span-2">
        <span className="label">Notes (optional)</span>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />
      </label>
      <label className="block md:col-span-2">
        <span className="label">File</span>
        <input
          className="input"
          type="file"
          accept={HS_EVIDENCE_ACCEPT.join(',')}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      <div className="md:col-span-2 flex gap-2 justify-end">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn-cta" disabled={busy || !title.trim() || !file}>
          {busy && <Loader2 size={15} className="animate-spin" />} {supersedes ? 'Upload new version' : 'Add document'}
        </button>
      </div>
    </form>
  );
}
