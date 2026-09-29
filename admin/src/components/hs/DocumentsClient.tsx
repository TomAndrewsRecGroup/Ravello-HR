'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { HS_REGISTER_CATEGORIES, HS_REGISTER_CATEGORY_LABELS, HS_DOCUMENT_STATUS_LABELS,
  HS_DOCUMENT_HISTORY_STATUSES, type HsRegisterCategory } from '@/lib/hs/vocab';
import { HS_EVIDENCE_ACCEPT, evidenceUrl, uploadEvidence } from '@/lib/hs/evidence';
import type { HsDocument, HsFile } from '@/lib/hs/types';

interface StaffOption { id: string; full_name: string | null }

interface Props {
  companyId: string;
  documents: HsDocument[];
  files:     HsFile[];
  staff:     StaffOption[];
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

export default function DocumentsClient({ companyId, documents, files, staff, loadError }: Props) {
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<HsDocument | null>(null);
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);

  const current = documents.filter(d => d.status === 'active');
  const inProgress = documents.filter(d => !['active', ...HS_DOCUMENT_HISTORY_STATUSES].includes(d.status));
  const history = documents.filter(d => (HS_DOCUMENT_HISTORY_STATUSES as readonly string[]).includes(d.status));

  const staffName = (id: string | null) => id ? (staff.find(s => s.id === id)?.full_name ?? 'Unknown') : null;

  // A "lineage" is every version that shares an original ancestor — walked
  // via supersedes_id in both directions. Used only for the History view,
  // which shows ALL versions of one document, clearly labelling each.
  function lineageOf(doc: HsDocument): HsDocument[] {
    const byId = new Map(documents.map(d => [d.id, d]));
    const seen = new Set<string>();
    const stack = [doc.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const d = byId.get(id);
      if (d?.supersedes_id) stack.push(d.supersedes_id);
      for (const other of documents) if (other.supersedes_id === id) stack.push(other.id);
    }
    return documents.filter(d => seen.has(d.id)).sort((a, b) => b.version - a.version);
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the document library: {loadError}</p>}

      <div className="flex items-center justify-end">
        <button className="btn-cta btn-sm" onClick={() => setAdding(a => !a)}>
          <Plus size={14} /> Add document
        </button>
      </div>

      {adding && <DocumentForm companyId={companyId} staff={staff} onDone={() => setAdding(false)} />}
      {replacing && (
        <DocumentForm
          companyId={companyId}
          staff={staff}
          supersedes={replacing}
          onDone={() => setReplacing(null)}
        />
      )}

      {inProgress.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>In progress</p>
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {inProgress.map(doc => (
              <DocumentRow key={doc.id} doc={doc} files={files} staffName={staffName}
                onReplace={null} onHistory={() => setHistoryOpenFor(doc.id)} />
            ))}
          </ul>
        </div>
      )}

      {current.length === 0 && inProgress.length === 0 ? (
        <div className="card empty-state p-10">
          <FileText size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No H&amp;S documents for this client yet.</p>
        </div>
      ) : current.length > 0 && (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {current.map(doc => (
            <DocumentRow key={doc.id} doc={doc} files={files} staffName={staffName}
              onReplace={() => setReplacing(doc)} onHistory={() => setHistoryOpenFor(doc.id)} />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--ink-soft)' }}>
            {history.length} superseded / withdrawn / archived version{history.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
            {history.map(doc => {
              const file = files.find(f => f.entity_type === 'document' && f.entity_id === doc.id);
              return (
                <li key={doc.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {doc.title} · v{doc.version} · <strong>{HS_DOCUMENT_STATUS_LABELS[doc.status]}</strong>
                  </span>
                  <span className="flex items-center gap-2">
                    {file && <OpenFileButton storagePath={file.storage_path} />}
                    <ArchiveButton doc={doc} />
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {historyOpenFor && (
        <HistoryModal
          versions={lineageOf(documents.find(d => d.id === historyOpenFor)!)}
          files={files}
          onClose={() => setHistoryOpenFor(null)}
        />
      )}
    </div>
  );
}

function DocumentRow({ doc, files, staffName, onReplace, onHistory }: {
  doc: HsDocument; files: HsFile[]; staffName: (id: string | null) => string | null;
  onReplace: (() => void) | null; onHistory: () => void;
}) {
  const rag = ragFor(doc.review_due_at);
  const R = RAG[rag];
  const file = files.find(f => f.entity_type === 'document' && f.entity_id === doc.id);
  const isCurrent = doc.status === 'active';
  return (
    <li className="p-4 flex items-start gap-3">
      {isCurrent
        ? <R.icon size={16} style={{ color: R.colour, flexShrink: 0, marginTop: 2 }} aria-hidden />
        : <FileText size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0, marginTop: 2 }} aria-hidden />}
      <div className="flex-1 min-w-0">
        <p className="font-medium" style={{ color: 'var(--ink)' }}>
          {doc.title} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>v{doc.version}</span>
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {HS_REGISTER_CATEGORY_LABELS[doc.category as HsRegisterCategory] ?? doc.category}
          {' · '}{HS_DOCUMENT_STATUS_LABELS[doc.status]}
          {doc.review_due_at && ` · review due ${fmt(doc.review_due_at)}`}
          {doc.effective_from && ` · effective ${fmt(doc.effective_from)}`}
        </p>
        {(doc.reviewer_id || doc.approver_id) && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            {doc.reviewer_id && `Reviewer: ${staffName(doc.reviewer_id)}`}
            {doc.reviewer_id && doc.approver_id && ' · '}
            {doc.approver_id && `Approver: ${staffName(doc.approver_id)}`}
          </p>
        )}
        {doc.description && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{doc.description}</p>}
      </div>
      <div className="flex flex-col items-end gap-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {isCurrent && <span className="text-xs font-medium" style={{ color: R.colour }}>{R.label}</span>}
          {file && <OpenFileButton storagePath={file.storage_path} />}
          <button className="btn-ghost btn-sm" onClick={onHistory}>History</button>
          {onReplace && (
            <button className="btn-secondary btn-sm" onClick={onReplace}>
              <RefreshCw size={13} /> New version
            </button>
          )}
        </div>
        <WorkflowActions doc={doc} />
      </div>
    </li>
  );
}

/** The next lifecycle action(s) a status offers — a superset the
 *  database's own hs_document_lifecycle_guard() is the real authority
 *  on; a button here is only an ordinary UPDATE, and whatever the
 *  trigger refuses is surfaced verbatim, never pre-validated here. */
function nextActions(doc: HsDocument): { label: string; to: HsDocument['status'] }[] {
  switch (doc.status) {
    case 'draft':
      return [
        doc.reviewer_id ? { label: 'Submit for review', to: 'pending_review' }
          : doc.approver_id ? { label: 'Submit for approval', to: 'pending_approval' }
          : { label: 'Publish', to: 'active' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    case 'pending_review':
      return [
        doc.approver_id ? { label: 'Send for approval', to: 'pending_approval' } : { label: 'Publish', to: 'active' },
        { label: 'Send back to draft', to: 'draft' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    case 'pending_approval':
      return [
        { label: 'Approve', to: 'approved' },
        { label: 'Send back to draft', to: 'draft' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    case 'approved':
      return [
        { label: 'Publish now', to: 'active' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    case 'active':
      return [
        { label: 'Flag for review', to: 'review_due' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    case 'review_due':
      return [
        { label: 'Mark reviewed', to: 'active' },
        { label: 'Withdraw', to: 'withdrawn' },
      ];
    default:
      return [];
  }
}

function WorkflowActions({ doc }: { doc: HsDocument }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const actions = nextActions(doc);
  if (actions.length === 0) return null;

  async function go(to: HsDocument['status']) {
    setBusy(to);
    const supabase = createClient();
    const res = await supabase.from('hs_documents').update({ status: to }, COUNT_EXACT).eq('id', doc.id);
    setBusy(null);
    // The database's own refusal message, verbatim — no UI-side
    // pre-validation duplicating hs_document_lifecycle_guard().
    const outcome = judgeWrite(res, 'This document');
    if (!outcome.ok) { toast(outcome.message ?? 'Could not update the document.', 'error'); return; }
    toast('Updated', 'success');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      {actions.map(a => (
        <button key={a.to} className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => go(a.to)}>
          {busy === a.to ? <Loader2 size={12} className="animate-spin" /> : null} {a.label}
        </button>
      ))}
    </div>
  );
}

function ArchiveButton({ doc }: { doc: HsDocument }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (doc.status === 'archived') return null;
  async function archive() {
    setBusy(true);
    const supabase = createClient();
    const res = await supabase.from('hs_documents').update({ status: 'archived' }, COUNT_EXACT).eq('id', doc.id);
    setBusy(false);
    const outcome = judgeWrite(res, 'This document');
    if (!outcome.ok) { toast(outcome.message ?? 'Could not archive the document.', 'error'); return; }
    router.refresh();
  }
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={archive} disabled={busy}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : null} Archive
    </button>
  );
}

function HistoryModal({ versions, files, onClose }: { versions: HsDocument[]; files: HsFile[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,11,29,0.5)' }} onClick={onClose}>
      <div className="card p-4 max-w-xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium" style={{ color: 'var(--ink)' }}>Version history</p>
          <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {versions.map(v => {
            const file = files.find(f => f.entity_type === 'document' && f.entity_id === v.id);
            return (
              <li key={v.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span>
                  v{v.version} · <strong>{HS_DOCUMENT_STATUS_LABELS[v.status]}</strong>
                  {v.status !== 'active' && (HS_DOCUMENT_HISTORY_STATUSES as readonly string[]).includes(v.status) &&
                    <span style={{ color: 'var(--ink-faint)' }}> (no longer current)</span>}
                </span>
                {file && <OpenFileButton storagePath={file.storage_path} />}
              </li>
            );
          })}
        </ul>
      </div>
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

function DocumentForm({ companyId, staff, supersedes, onDone }: {
  companyId: string; staff: StaffOption[]; supersedes?: HsDocument; onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(supersedes?.title ?? '');
  const [category, setCategory] = useState<HsRegisterCategory>((supersedes?.category as HsRegisterCategory) ?? 'hs_policy_governance');
  const [description, setDescription] = useState(supersedes?.description ?? '');
  const [reviewDueAt, setReviewDueAt] = useState(supersedes?.review_due_at ?? '');
  const [reviewerId, setReviewerId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [retentionMonths, setRetentionMonths] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast('Choose a file to upload.', 'error'); return; }
    setBusy(true);
    const supabase = createClient();
    // Every insert lands as 'draft' regardless of what is sent — the
    // database's own hs_document_lifecycle_guard() enforces this
    // (rule 2); the workflow buttons on the row take it from there.
    const { data, error } = await supabase.from('hs_documents').insert({
      company_id: companyId, title: title.trim(), category,
      description: description.trim() || null, review_due_at: reviewDueAt || null,
      version: supersedes ? supersedes.version + 1 : 1,
      supersedes_id: supersedes?.id ?? null,
      reviewer_id: reviewerId || null,
      approver_id: approverId || null,
      effective_from: effectiveFrom || null,
      retention_period_months: retentionMonths ? Number(retentionMonths) : null,
    }).select('id').single();
    if (error || !data) { setBusy(false); toast(error?.message ?? 'Could not save the document.', 'error'); return; }

    const problem = await uploadEvidence(supabase, { companyId, entityType: 'document', entityId: data.id, file });
    if (problem) { setBusy(false); toast(problem, 'error'); return; }

    // The old version is NOT flipped here: hs_document_supersede_roll()
    // (160) flips it automatically, and only once this new version
    // actually reaches 'active' — so the current document stays
    // readable throughout this draft's own review/approval.

    setBusy(false);
    toast(supersedes ? 'New draft version created' : 'Document drafted', 'success');
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      {supersedes && (
        <p className="md:col-span-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
          Replacing <strong>{supersedes.title}</strong> (v{supersedes.version}). The current version stays in
          effect until this new draft is published.
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
      <label className="block">
        <span className="label">Reviewer (optional)</span>
        <select className="input" value={reviewerId} onChange={e => setReviewerId(e.target.value)}>
          <option value="">No formal review required</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name ?? s.id}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Approver (optional)</span>
        <select className="input" value={approverId} onChange={e => setApproverId(e.target.value)}>
          <option value="">No formal approval required</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name ?? s.id}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Effective from (optional)</span>
        <input className="input" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Leave blank for effective immediately on publish.</span>
      </label>
      <label className="block">
        <span className="label">Retention period, months (optional)</span>
        <input className="input" type="number" min={1} max={1200} value={retentionMonths} onChange={e => setRetentionMonths(e.target.value)} />
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
          {busy && <Loader2 size={15} className="animate-spin" />} {supersedes ? 'Create draft version' : 'Add document'}
        </button>
      </div>
    </form>
  );
}
