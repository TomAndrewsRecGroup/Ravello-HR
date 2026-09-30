'use client';
import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Scale, Megaphone, Search, ChevronDown, ChevronUp, Loader2, PenLine } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { LEGAL_REQUIREMENT_CATEGORIES, LEGAL_REQUIREMENT_CATEGORY_LABELS, type LegalRequirementCategory } from '@/lib/hs/vocab';
import type { LegalRequirement, LegalRequirementResearchNote } from '@/lib/hs/types';

interface Props {
  requirements: LegalRequirement[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// Staff-only reference catalogue — a title, category, jurisdiction and
// a short internal summary staff write themselves, never the actual
// statute text (migration 159's own rule 4). Applicability and
// evaluation live per client on /health-safety/<companyId>/legal.
export default function LegalRequirementsCatalogueClient({ requirements, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<LegalRequirementCategory>('general');
  const [jurisdiction, setJurisdiction] = useState('UK');
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  // Core-OS 360 Phase 17: Regulatory Intelligence → Action. A research
  // panel per requirement — notes are loaded lazily on first expand
  // (a direct client-side read; this table is staff FOR ALL RLS, the
  // same posture every other staff-authored catalogue read here
  // already uses). Running a search calls the ONE route that ever
  // talks to Tavily; nothing here ever writes an applicability or
  // compliance verdict — "Mark reviewed" only ever records what a
  // HUMAN decided, in action_taken, a plain text field.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, LegalRequirementResearchNote[]>>({});
  const [loadingNotes, setLoadingNotes] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [savingReview, setSavingReview] = useState<string | null>(null);
  // Core-OS 360 Completion Programme, Phase 25, Group 2 (C17.5): a
  // manual-entry form alongside the Tavily search — for research done
  // outside this platform (a phone call to a regulator, a read of a
  // trade-body circular) that still belongs on the same timeline,
  // visibly marked source: 'manual' so it is never confused with a
  // Tavily result (the badge on each note already shows which).
  const [manualOpenFor, setManualOpenFor] = useState<string | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [manualWhatWasChecked, setManualWhatWasChecked] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  async function toggleExpand(requirementId: string) {
    if (expandedId === requirementId) { setExpandedId(null); return; }
    setExpandedId(requirementId);
    setSearchQuery('');
    if (!notesById[requirementId]) {
      setLoadingNotes(requirementId);
      const { data, error } = await createClient().from('legal_requirement_research_notes')
        .select('id, legal_requirement_id, source, query_used, raw_result_summary, reviewed_by, reviewed_at, action_taken, created_by, created_at, row_version')
        .eq('legal_requirement_id', requirementId).order('created_at', { ascending: false }).limit(50);
      setLoadingNotes(null);
      if (error) { toast(error.message, 'error'); return; }
      setNotesById(prev => ({ ...prev, [requirementId]: (data ?? []) as LegalRequirementResearchNote[] }));
    }
  }

  async function runSearch(requirementId: string) {
    setSearching(requirementId);
    const res = await fetch(`/api/admin/legal-register/${requirementId}/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setSearching(null);
    if (!res.ok) { toast(body.error ?? 'The search could not be completed.', 'error'); return; }
    setNotesById(prev => ({ ...prev, [requirementId]: [body.note as LegalRequirementResearchNote, ...(prev[requirementId] ?? [])] }));
    setSearchQuery('');
    toast('Search recorded', 'success');
  }

  async function markReviewed(note: LegalRequirementResearchNote) {
    setSavingReview(note.id);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    // Core-OS 360 Completion Programme, Phase 25, Group 2 (C17.6):
    // conditional on the row_version this note was loaded with — the
    // migration 192 trigger always advances it, so a 0-row match means
    // someone else already reviewed (or otherwise updated) this exact
    // note since it was fetched, never a silent overwrite of their work.
    const res = await sb.from('legal_requirement_research_notes').update({
      reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
      action_taken: (reviewDrafts[note.id] ?? '').trim() || null,
    }, COUNT_EXACT).eq('id', note.id).eq('row_version', note.row_version);
    setSavingReview(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The research note');
    if (!out.ok) {
      toast(res.error ? out.message! : 'Someone else already reviewed this note. Refresh to see their update.', 'error');
      return;
    }
    setNotesById(prev => ({
      ...prev,
      [note.legal_requirement_id]: (prev[note.legal_requirement_id] ?? []).map(n =>
        n.id === note.id
          ? { ...n, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(), action_taken: (reviewDrafts[note.id] ?? '').trim() || null, row_version: n.row_version + 1 }
          : n),
    }));
    toast('Marked reviewed', 'success');
  }

  // Core-OS 360 Completion Programme, Phase 25, Group 2 (C17.5): a
  // research note that did not come from Tavily — a phone call with a
  // regulator, a trade-body circular, a manual check of legislation.gov.uk.
  // Inserted directly under staff RLS, the exact "Add legal requirement"
  // form above already uses for the same table-level posture. source is
  // always 'manual' — never hand-typed by the form, so it can never be
  // confused with an automated Tavily result.
  async function addManualNote(requirementId: string) {
    const summary = manualNote.trim();
    if (!summary) return;
    setSavingManual(true);
    const { data, error } = await createClient().from('legal_requirement_research_notes').insert({
      legal_requirement_id: requirementId, source: 'manual',
      query_used: manualWhatWasChecked.trim() || null,
      raw_result_summary: summary,
    }).select('id, legal_requirement_id, source, query_used, raw_result_summary, reviewed_by, reviewed_at, action_taken, created_by, created_at, row_version').single();
    setSavingManual(false);
    if (error) { toast(error.message, 'error'); return; }
    setNotesById(prev => ({ ...prev, [requirementId]: [data as LegalRequirementResearchNote, ...(prev[requirementId] ?? [])] }));
    setManualNote(''); setManualWhatWasChecked(''); setManualOpenFor(null);
    toast('Manual note recorded', 'success');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('legal_requirements').insert({
      title: title.trim(), category, jurisdiction: jurisdiction.trim() || 'UK',
      summary: summary.trim() || null, source_url: sourceUrl.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Legal requirement added', 'success');
    setTitle(''); setSummary(''); setSourceUrl(''); setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} className="mr-1" /> Add legal requirement</button>
      </div>
      {open && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-2 gap-3 items-end">
          <div className="col-span-2">
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Health and Safety at Work etc. Act 1974" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as LegalRequirementCategory)}>
              {LEGAL_REQUIREMENT_CATEGORIES.map(c => <option key={c} value={c}>{LEGAL_REQUIREMENT_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Jurisdiction</label>
            <input className="input" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="UK" />
          </div>
          <div className="col-span-2">
            <label className="label">Internal summary (never the statute text itself)</label>
            <textarea className="input" rows={2} value={summary} onChange={e => setSummary(e.target.value)} placeholder="A short, staff-written paraphrase of what this requirement covers." />
          </div>
          <div className="col-span-2">
            <label className="label">Source link (optional)</label>
            <input className="input" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://www.legislation.gov.uk/..." />
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </form>
      )}
      {requirements.length === 0 ? (
        <div className="card empty-state p-10">
          <Scale size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No legal requirements on file yet.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Title</th><th>Category</th><th>Jurisdiction</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {requirements.map(r => (
                <Fragment key={r.id}>
                <tr>
                  <td>
                    <strong>{r.title}</strong>
                    {r.summary && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.summary}</p>}
                  </td>
                  <td><span className="badge">{LEGAL_REQUIREMENT_CATEGORY_LABELS[r.category] ?? r.category}</span></td>
                  <td>{r.jurisdiction}</td>
                  <td>
                    {r.source_url
                      ? <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)' }}>Source</a>
                      : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                  </td>
                  <td>
                    <div className="flex gap-1.5 justify-end">
                      <button type="button" className="btn-ghost btn-sm flex items-center gap-1.5 whitespace-nowrap" onClick={() => toggleExpand(r.id)}>
                        <Search size={13} /> Research {expandedId === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {/* Prefills the Broadcast compose form and pre-selects every
                          client whose own register already holds this requirement
                          as 'applicable' — the same reviewed-before-sending confirm
                          modal as any other broadcast; nothing sends automatically. */}
                      <Link
                        href={`/broadcast?legal=${r.id}`}
                        className="btn-ghost btn-sm flex items-center gap-1.5 whitespace-nowrap"
                        title="Broadcast an update about this requirement to affected clients"
                      >
                        <Megaphone size={13} /> Broadcast
                      </Link>
                    </div>
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr>
                    <td colSpan={5}>
                      {/* Core-OS 360 Phase 17. Tavily is a plain web search — it
                          decides nothing here. raw_result_summary is Tavily's own
                          verbatim titles/urls/content, never an AI paraphrase; only
                          a human, via "Mark reviewed", records what (if anything)
                          was actually done about it. */}
                      <div className="rounded-md p-4 space-y-3" style={{ background: 'var(--surface-soft)' }}>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="block flex-1 min-w-[200px]">
                            <span className="label">Search query (optional — defaults to this requirement&apos;s title + jurisdiction)</span>
                            <input className="input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} maxLength={500}
                              placeholder={`${r.title} ${r.jurisdiction} recent changes updates`} />
                          </label>
                          <button type="button" className="btn-cta btn-sm flex items-center gap-1.5" disabled={searching === r.id} onClick={() => runSearch(r.id)}>
                            {searching === r.id ? <Loader2 size={14} className="animate-spin" /> : <Search size={13} />} Run Tavily search
                          </button>
                          <button type="button" className="btn-secondary btn-sm flex items-center gap-1.5"
                            onClick={() => setManualOpenFor(o => o === r.id ? null : r.id)}>
                            <PenLine size={13} /> Add manual note
                          </button>
                        </div>
                        {manualOpenFor === r.id && (
                          <div className="rounded-md p-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                            <label className="block">
                              <span className="label">What was checked (optional)</span>
                              <input className="input" maxLength={500} value={manualWhatWasChecked}
                                onChange={e => setManualWhatWasChecked(e.target.value)}
                                placeholder="e.g. Phone call with HSE, 24 Sept 2026" />
                            </label>
                            <label className="block">
                              <span className="label">What was found</span>
                              <textarea className="input" rows={3} maxLength={4000} value={manualNote}
                                onChange={e => setManualNote(e.target.value)}
                                placeholder="A plain record of what was found — never an AI paraphrase, the same discipline Tavily's own results follow." />
                            </label>
                            <div className="flex justify-end gap-2">
                              <button type="button" className="btn-ghost btn-sm" onClick={() => { setManualOpenFor(null); setManualNote(''); setManualWhatWasChecked(''); }}>Cancel</button>
                              <button type="button" className="btn-cta btn-sm" disabled={savingManual || !manualNote.trim()} onClick={() => addManualNote(r.id)}>
                                {savingManual ? 'Saving…' : 'Save note'}
                              </button>
                            </div>
                          </div>
                        )}
                        {loadingNotes === r.id ? (
                          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Loading past research…</p>
                        ) : (notesById[r.id]?.length ?? 0) === 0 ? (
                          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No research recorded for this requirement yet.</p>
                        ) : (
                          <ul className="space-y-2">
                            {(notesById[r.id] ?? []).map(note => (
                              <li key={note.id} className="card p-3 space-y-2">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                                  <span className="badge">{note.source}</span>
                                  {note.query_used && <span>&ldquo;{note.query_used}&rdquo;</span>}
                                  <span className="ml-auto">{fmt(note.created_at)}</span>
                                </div>
                                {note.raw_result_summary && (
                                  <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--ink-soft)', fontFamily: 'inherit' }}>{note.raw_result_summary}</pre>
                                )}
                                {note.reviewed_at ? (
                                  <p className="text-xs" style={{ color: 'var(--teal)' }}>
                                    Reviewed {fmt(note.reviewed_at)}{note.action_taken ? ` — ${note.action_taken}` : ' — no action needed'}
                                  </p>
                                ) : (
                                  <div className="flex flex-wrap items-end gap-2">
                                    <label className="block flex-1 min-w-[200px]">
                                      <span className="label">Action taken (optional)</span>
                                      <input className="input" maxLength={2000} value={reviewDrafts[note.id] ?? ''}
                                        onChange={e => setReviewDrafts(p => ({ ...p, [note.id]: e.target.value }))}
                                        placeholder="e.g. No material change found / Broadcasted an update to affected clients" />
                                    </label>
                                    <button type="button" className="btn-secondary btn-sm" disabled={savingReview === note.id} onClick={() => markReviewed(note)}>
                                      {savingReview === note.id ? 'Saving…' : 'Mark reviewed'}
                                    </button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
