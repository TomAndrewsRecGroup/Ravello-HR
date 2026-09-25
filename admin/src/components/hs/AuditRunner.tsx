'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, CloudOff, Loader2, Plus, Trash2, WifiOff, X, XCircle } from 'lucide-react';
import { useToast } from '@/components/modules/Toast';
import { createClient } from '@/lib/supabase/client';
import { HS_EVIDENCE_ACCEPT, uploadEvidence } from '@/lib/hs/evidence';
import { HS_REGISTER_CATEGORY_LABELS, type HsRegisterCategory } from '@/lib/hs/vocab';
import type { HsAuditRating } from '@/lib/hs/vocab';
import type { HsAuditTemplate, HsAuditTemplateItem } from '@/lib/hs/types';
import { computeAuditScore, countFindings } from '@/lib/hs/auditScore';

// The offline-capable audit runner. "Offline-capable" here means: every
// answer lives in the browser's own localStorage from the moment it is
// typed, auto-saved on every change, so a dropped connection or a closed
// tab during a site visit never loses an answer — there is nothing to
// lose, because nothing has touched the network yet. The ONE network
// call is the final Submit, and if that fails while offline the draft
// stays exactly where it was and retries automatically the moment the
// browser reports it is back online (`window.addEventListener('online')`).
//
// This is not a full service-worker background-sync queue — the admin
// service worker deliberately never caches /api/ (see public/sw.js) —
// but it covers the real failure mode a site visit has: patchy signal
// while WORKING, not necessarily while on the single submit call at the
// end. See CLAUDE.md for the scope this was built to, and what it isn't.

interface Site { id: string; name: string; }
interface Draft {
  draftId: string;
  companyId: string;
  siteId: string | null;
  templateId: string | null;
  title: string;
  conductedOn: string;
  notes: string;
  responses: { id: string; templateItemId: string | null; prompt: string; category: string | null; rating: HsAuditRating | null; comment: string }[];
  pendingSubmit: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const draftKey = (companyId: string) => `hs-audit-draft:${companyId}`;

function newDraft(companyId: string): Draft {
  return {
    draftId: crypto.randomUUID(), companyId, siteId: null, templateId: null,
    title: '', conductedOn: today(), notes: '', responses: [], pendingSubmit: false,
  };
}

function loadDraft(companyId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(companyId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.draftId) return null;
    // A draft saved before response ids existed (113) has none — backfill
    // so evidence staged against it still has somewhere to attach to.
    d.responses = d.responses.map(r => ({ ...r, id: r.id || crypto.randomUUID() }));
    return d;
  } catch { return null; }
}

function saveDraft(d: Draft) {
  try { localStorage.setItem(draftKey(d.companyId), JSON.stringify(d)); } catch { /* storage full or blocked: nothing more we can do client-side */ }
}

function clearDraft(companyId: string) {
  try { localStorage.removeItem(draftKey(companyId)); } catch { /* ignore */ }
}

const RATING_STYLE: Record<HsAuditRating, { bg: string; color: string }> = {
  pass: { bg: 'rgba(22,163,74,0.10)', color: 'var(--success)' },
  fail: { bg: 'rgba(217,68,68,0.10)', color: 'var(--danger)' },
  na:   { bg: 'rgba(148,163,184,0.10)', color: 'var(--ink-faint)' },
};

export default function AuditRunner({ companyId, sites, templates, templateItems }: {
  companyId: string; sites: Site[]; templates: HsAuditTemplate[]; templateItems: HsAuditTemplateItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => (typeof window === 'undefined' ? newDraft(companyId) : (loadDraft(companyId) ?? newDraft(companyId))));
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const retryArmed = useRef(false);

  // Evidence photos staged per response, keyed by the response's own
  // (client-generated) id. Kept in memory only, NOT persisted to
  // localStorage — a File object cannot be serialised, and photos are
  // the one part of a draft that does not survive a closed tab. That is
  // a real, narrower limitation than the rest of the draft (which does
  // survive), and is worth knowing rather than silently losing photos
  // with no indication. Uploaded to hs-evidence only after Submit
  // succeeds, against the now-durable response row.
  const [photosByResponse, setPhotosByResponse] = useState<Record<string, File[]>>({});

  function addPhotos(responseId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotosByResponse(p => ({ ...p, [responseId]: [...(p[responseId] ?? []), ...Array.from(files)] }));
  }

  function removePhoto(responseId: string, index: number) {
    setPhotosByResponse(p => ({ ...p, [responseId]: (p[responseId] ?? []).filter((_, i) => i !== index) }));
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { saveDraft(draft); }, [draft]);

  const itemsForTemplate = useMemo(
    () => templateItems.filter(i => i.template_id === draft.templateId).sort((a, b) => a.sort_order - b.sort_order),
    [templateItems, draft.templateId],
  );

  function pickTemplate(templateId: string) {
    const t = templates.find(x => x.id === templateId);
    const items = templateItems.filter(i => i.template_id === templateId).sort((a, b) => a.sort_order - b.sort_order);
    setDraft(d => ({
      ...d, templateId,
      title: d.title || (t ? `${t.name} — ${today()}` : d.title),
      responses: items.map(i => ({ id: crypto.randomUUID(), templateItemId: i.id, prompt: i.prompt, category: i.category, rating: null, comment: '' })),
    }));
    setPhotosByResponse({});
  }

  function addAdHocQuestion() {
    setDraft(d => ({ ...d, responses: [...d.responses, { id: crypto.randomUUID(), templateItemId: null, prompt: '', category: null, rating: null, comment: '' }] }));
  }

  function removeQuestion(index: number) {
    const removedId = draft.responses[index]?.id;
    setDraft(d => ({ ...d, responses: d.responses.filter((_, i) => i !== index) }));
    if (removedId) setPhotosByResponse(p => { const { [removedId]: _drop, ...rest } = p; return rest; });
  }

  function setRating(index: number, rating: HsAuditRating) {
    setDraft(d => ({ ...d, responses: d.responses.map((r, i) => i === index ? { ...r, rating } : r) }));
  }

  function setComment(index: number, comment: string) {
    setDraft(d => ({ ...d, responses: d.responses.map((r, i) => i === index ? { ...r, comment } : r) }));
  }

  function setPrompt(index: number, prompt: string) {
    setDraft(d => ({ ...d, responses: d.responses.map((r, i) => i === index ? { ...r, prompt } : r) }));
  }

  const answered = draft.responses.filter(r => r.rating != null);
  const scorePreview = computeAuditScore(answered.filter((r): r is typeof r & { rating: HsAuditRating } => r.rating != null));
  const findingsPreview = countFindings(answered.filter((r): r is typeof r & { rating: HsAuditRating } => r.rating != null));
  const canSubmit = draft.title.trim().length > 0 && draft.responses.length > 0 && draft.responses.every(r => r.rating != null && r.prompt.trim().length > 0);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/health-safety/audits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.draftId, company_id: companyId, site_id: draft.siteId, template_id: draft.templateId,
          title: draft.title.trim(), conducted_on: draft.conductedOn, notes: draft.notes.trim() || null,
          responses: draft.responses.map(r => ({
            id: r.id, template_item_id: r.templateItemId, prompt: r.prompt.trim(), category: r.category, rating: r.rating, comment: r.comment.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Could not submit (${res.status})`);
      }
      const json = await res.json();

      // Upload any staged photos now that each response row is durable,
      // keyed by the SAME id just sent above. A photo failing to upload
      // does not lose the audit itself — it already saved — so this is
      // reported, not thrown.
      const uploadProblems: string[] = [];
      const supabase = createClient();
      for (const r of draft.responses) {
        for (const file of photosByResponse[r.id] ?? []) {
          const problem = await uploadEvidence(supabase, { companyId, entityType: 'audit_response', entityId: r.id, file });
          if (problem) uploadProblems.push(problem);
        }
      }

      clearDraft(companyId);
      setPhotosByResponse({});
      if (uploadProblems.length > 0) {
        toast(`Audit submitted (${json.score == null ? 'no score' : `${json.score}%`}), but some evidence did not upload: ${uploadProblems.join(' ')}`, 'error');
      } else {
        toast(`Audit submitted — ${json.score == null ? 'no score' : `${json.score}%`}`, 'success');
      }
      router.push(`/health-safety/${companyId}/audits`);
    } catch (err) {
      // A network failure (offline, or the request never reached the
      // server) keeps the draft exactly as it was and retries once we
      // are told the browser is back online.
      setDraft(d => ({ ...d, pendingSubmit: true }));
      toast(navigator.onLine ? (err as Error).message : "You're offline — this will submit automatically once you're back online.", navigator.onLine ? 'error' : 'info');
    } finally {
      setSubmitting(false);
    }
  }, [draft, companyId, router, toast, photosByResponse]);

  useEffect(() => {
    if (online && draft.pendingSubmit && !retryArmed.current) {
      retryArmed.current = true;
      submit().finally(() => { retryArmed.current = false; });
    }
  }, [online, draft.pendingSubmit, submit]);

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center gap-2 text-sm" style={{ color: online ? 'var(--ink-faint)' : 'var(--amber)' }}>
        {online ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
        {online ? 'Online — answers are also saved on this device as you go.' : "Offline — your answers are being saved on this device and will submit automatically once you're back online."}
        {draft.pendingSubmit && <span className="ml-auto flex items-center gap-1"><CloudOff size={13} /> Submit pending</span>}
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Template</label>
            <select className="input" value={draft.templateId ?? ''} onChange={e => e.target.value ? pickTemplate(e.target.value) : setDraft(d => ({ ...d, templateId: null }))}>
              <option value="">Ad-hoc (no template)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Site</label>
            <select className="input" value={draft.siteId ?? ''} onChange={e => setDraft(d => ({ ...d, siteId: e.target.value || null }))}>
              <option value="">No specific site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Title *</label>
            <input className="input" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="e.g. Fire safety walk-round" />
          </div>
          <div>
            <label className="label">Date conducted *</label>
            <input type="date" className="input" value={draft.conductedOn} onChange={e => setDraft(d => ({ ...d, conductedOn: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Checklist</h3>
          {!draft.templateId && (
            <button onClick={addAdHocQuestion} className="btn-secondary btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Add question
            </button>
          )}
        </div>

        {draft.responses.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Pick a template above, or add ad-hoc questions.</p>
        )}

        {draft.responses.map((r, i) => {
          const templateItem = r.templateItemId ? templateItems.find(t => t.id === r.templateItemId) : null;
          return (
            <div key={r.templateItemId ?? i} className="p-3 rounded-[8px] space-y-2" style={{ border: '1px solid var(--line)' }}>
              <div className="flex items-start gap-2">
                {draft.templateId ? (
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.prompt}</p>
                    {templateItem?.guidance && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{templateItem.guidance}</p>}
                    {r.category && <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>{HS_REGISTER_CATEGORY_LABELS[r.category as HsRegisterCategory] ?? r.category}</p>}
                  </div>
                ) : (
                  <input className="input flex-1" placeholder="Question" value={r.prompt} onChange={e => setPrompt(i, e.target.value)} />
                )}
                {!draft.templateId && (
                  <button onClick={() => removeQuestion(i)} className="btn-icon btn-sm" style={{ color: 'var(--ink-faint)' }} aria-label="Remove question">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(['pass', 'fail', 'na'] as const).map(rating => (
                  <button
                    key={rating}
                    onClick={() => setRating(i, rating)}
                    className="px-2.5 py-1 rounded-[6px] text-xs font-semibold uppercase tracking-wide"
                    style={r.rating === rating ? RATING_STYLE[rating] : { background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}
                  >
                    {rating === 'na' ? 'N/A' : rating}
                  </button>
                ))}
                {r.rating === 'fail' && <XCircle size={14} style={{ color: 'var(--danger)' }} />}
              </div>
              {(r.rating === 'fail' || r.comment) && (
                <textarea
                  className="input h-14 resize-none text-sm"
                  placeholder={r.rating === 'fail' ? 'What did you find? (becomes a client action)' : 'Comment (optional)'}
                  value={r.comment}
                  onChange={e => setComment(i, e.target.value)}
                />
              )}
              {r.rating === 'fail' && (
                <div className="space-y-1.5">
                  <label className="btn-secondary btn-sm inline-flex items-center gap-1.5 cursor-pointer w-fit">
                    <Camera size={13} /> Add photo
                    <input
                      type="file" multiple accept={HS_EVIDENCE_ACCEPT.join(',')} className="hidden"
                      onChange={e => { addPhotos(r.id, e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  {(photosByResponse[r.id] ?? []).length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {(photosByResponse[r.id] ?? []).map((f, fi) => (
                        <li key={`${f.name}-${fi}`} className="badge flex items-center gap-1">
                          {f.name}
                          <button type="button" onClick={() => removePhoto(r.id, fi)} aria-label={`Remove ${f.name}`}>
                            <X size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-5 space-y-3">
        <label className="label">Overall notes</label>
        <textarea className="input h-20 resize-none" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {answered.length}/{draft.responses.length} answered
            {scorePreview != null && ` · ${scorePreview}% so far`}
            {findingsPreview > 0 && ` · ${findingsPreview} finding${findingsPreview === 1 ? '' : 's'}`}
          </p>
          <button onClick={submit} disabled={!canSubmit || submitting} className="btn-cta flex items-center gap-1.5">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {online ? 'Submit audit' : 'Save & retry when online'}
          </button>
        </div>
      </div>
    </div>
  );
}
