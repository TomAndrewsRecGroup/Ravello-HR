'use client';

import { useMemo, useState } from 'react';
import { FileText, ExternalLink, Loader2, ShieldAlert, Link2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { evidenceUrl } from '@/lib/hs/evidence';
import type { ComplianceItemCrossReference, ComplianceItemRow, EvidenceCoverageSummary } from '@/lib/evidenceEngine/analyze';

export interface EvidenceFileListRow {
  id: string;
  entity_type: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
}

// Core-OS 360 Phase 23, Group 3 (closes C11.5): links a cross-
// reference count to the relevant CATALOGUE page — never a per-link
// title resolution, the same economy Phase 8's own explorer scope
// note already accepted for uncurated neighbours. Admin's catalogue
// pages sit under the per-client /health-safety workspace; portal's
// sit under /protect. There is no separate "audit findings" catalogue
// page — a finding lives on its own audit — so that count links to
// the audits list instead, where every audit (and its findings) can
// be opened.
function catalogueHref(kind: 'iso' | 'legal' | 'objective' | 'audit_finding', role: 'admin' | 'portal', companyId: string): string {
  if (role === 'admin') {
    switch (kind) {
      case 'iso': return `/health-safety/${companyId}/iso`;
      case 'legal': return `/health-safety/${companyId}/legal`;
      case 'objective': return `/health-safety/${companyId}/objectives`;
      case 'audit_finding': return `/health-safety/${companyId}/audits`;
    }
  }
  switch (kind) {
    case 'iso': return '/protect/iso-readiness';
    case 'legal': return '/protect/legal-register';
    case 'objective': return '/protect/objectives';
    case 'audit_finding': return '/protect/audits';
  }
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Core-OS 360 Phase 11, Group 2 (shared-dupe pair: admin and portal —
// both read data already scoped by their own session's RLS). A
// "View" link signs a URL ON DEMAND when clicked, under the viewer's
// own session, rather than pre-signing every row on the server —
// avoiding N signed-URL round trips on a page that may list up to 200
// files. The same "signed under the user's own session" discipline
// evidenceUrl() already documents.
//
// Core-OS 360 Phase 23, Group 3 (closes C11.3, C11.4, C11.5): every
// filter below runs over the already-bounded, already-fetched arrays
// (200/500-row caps, well under PostgREST's ceiling) — no new query
// shape, the same "the data is already loaded, filter it in the
// browser" posture this codebase already uses for bounded browsing
// lists. The current/history toggle switches between two genuinely
// DIFFERENT pre-computed lists (coverage.currentGaps vs coverage.gaps)
// — never a UI filter recomputing the same thing analyze.ts already
// decided.
export default function EvidenceEngineClient({ files, coverage, items = [], crossReferences = [], role = 'admin', companyId = '' }: {
  files: EvidenceFileListRow[];
  coverage: EvidenceCoverageSummary;
  items?: ComplianceItemRow[];
  crossReferences?: ComplianceItemCrossReference[];
  role?: 'admin' | 'portal';
  companyId?: string;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCurrentOnly, setShowCurrentOnly] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const gapsSource = showCurrentOnly ? coverage.currentGaps : coverage.gaps;
  const filteredGaps = useMemo(() => gapsSource.filter(g =>
    (!categoryFilter || g.category === categoryFilter)
    && (!outcomeFilter || g.outcome === outcomeFilter)
    && (!dateFrom || g.completedOn >= dateFrom)
    && (!dateTo || g.completedOn <= dateTo),
  ), [gapsSource, categoryFilter, outcomeFilter, dateFrom, dateTo]);

  const categories = useMemo(() => [...new Set(coverage.gaps.map(g => g.category))].sort(), [coverage.gaps]);
  const entityTypes = useMemo(() => [...new Set(files.map(f => f.entity_type))].sort(), [files]);
  const filteredFiles = useMemo(() => (
    entityTypeFilter ? files.filter(f => f.entity_type === entityTypeFilter) : files
  ), [files, entityTypeFilter]);

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  async function open(file: EvidenceFileListRow) {
    setOpening(file.id); setError('');
    const supabase = createClient();
    const url = await evidenceUrl(supabase, file.storage_path);
    setOpening(null);
    if (!url) { setError(`Could not open ${file.file_name}.`); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} style={{ color: coverage.gaps.length > 0 ? 'var(--gold)' : 'var(--teal)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Register completions with no evidence attached</h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          "Has a file" is the whole test here — never a judgement of whether the file is any good.
        </p>
        {coverage.totalCompletions === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No register completions recorded yet.</p>
        ) : (
          <>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              <strong style={{ color: 'var(--ink)' }}>{coverage.completionsWithEvidenceCount}</strong> of{' '}
              <strong style={{ color: 'var(--ink)' }}>{coverage.totalCompletions}</strong> completions have evidence
              {coverage.coveragePercent != null && ` (${Math.round(coverage.coveragePercent)}%)`}.
            </p>
            {coverage.byCategory.length > 0 && (
              <ul className="text-sm space-y-1">
                {coverage.byCategory.map(c => (
                  <li key={c.category} className="flex items-center justify-between">
                    <span style={{ color: 'var(--ink-soft)' }}>{c.category.replace(/_/g, ' ')}</span>
                    <span style={{ color: c.withEvidence < c.total ? 'var(--gold)' : 'var(--teal)' }}>{c.withEvidence} / {c.total}</span>
                  </li>
                ))}
              </ul>
            )}
            {coverage.gaps.length > 0 && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="label text-xs">Show</span>
                    <select className="input" value={showCurrentOnly ? 'current' : 'history'} onChange={e => setShowCurrentOnly(e.target.value === 'current')}>
                      <option value="current">Current only (latest completion per item)</option>
                      <option value="history">Full history (every gap ever)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="label text-xs">Category</span>
                    <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                      <option value="">All</option>
                      {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label text-xs">Outcome</span>
                    <select className="input" value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
                      <option value="">All</option>
                      <option value="pass">Pass</option>
                      <option value="pass_with_actions">Pass with actions</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="label text-xs">From</span>
                    <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="label text-xs">To</span>
                    <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </label>
                </div>
                {filteredGaps.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No gaps match these filters.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead><tr><th>Register item</th><th>Category</th><th>Outcome</th><th>Completed</th></tr></thead>
                      <tbody>
                        {filteredGaps.slice(0, 50).map(g => (
                          <tr key={g.completionId}>
                            <td className="font-medium">{g.itemTitle}</td>
                            <td style={{ color: 'var(--ink-soft)' }}>{g.category.replace(/_/g, ' ')}</td>
                            <td style={{ color: g.outcome === 'fail' ? 'var(--red)' : 'var(--ink-soft)' }}>{g.outcome.replace(/_/g, ' ')}</td>
                            <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(g.completedOn)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredGaps.length > 50 && (
                      <p className="text-xs p-2" style={{ color: 'var(--ink-faint)' }}>Showing the 50 most recent of {filteredGaps.length}.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {crossReferences.length > 0 && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 size={18} style={{ color: 'var(--blue)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Compliance items referenced elsewhere</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            A count only — open the catalogue page itself to see which specific record links here.
          </p>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Register item</th><th>ISO clauses</th><th>Legal obligations</th><th>Objectives</th><th>Audit findings</th></tr></thead>
              <tbody>
                {crossReferences.map(r => {
                  const item = itemById.get(r.itemId);
                  return (
                    <tr key={r.itemId}>
                      <td className="font-medium">{item?.title ?? 'Untitled register item'}</td>
                      <td>{r.isoClauseCount > 0 ? <a href={catalogueHref('iso', role, companyId)} className="underline" style={{ color: 'var(--purple)' }}>{r.isoClauseCount}</a> : '—'}</td>
                      <td>{r.legalObligationCount > 0 ? <a href={catalogueHref('legal', role, companyId)} className="underline" style={{ color: 'var(--purple)' }}>{r.legalObligationCount}</a> : '—'}</td>
                      <td>{r.objectiveCount > 0 ? <a href={catalogueHref('objective', role, companyId)} className="underline" style={{ color: 'var(--purple)' }}>{r.objectiveCount}</a> : '—'}</td>
                      <td>{r.auditFindingCount > 0 ? <a href={catalogueHref('audit_finding', role, companyId)} className="underline" style={{ color: 'var(--purple)' }}>{r.auditFindingCount}</a> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={18} style={{ color: 'var(--blue)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Evidence library</h2>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {files.length === 0 ? (
          <div className="empty-state p-6"><p style={{ color: 'var(--ink-faint)' }}>No evidence uploaded yet.</p></div>
        ) : (
          <>
            {entityTypes.length > 1 && (
              <label className="block max-w-xs">
                <span className="label text-xs">Type</span>
                <select className="input" value={entityTypeFilter} onChange={e => setEntityTypeFilter(e.target.value)}>
                  <option value="">All</option>
                  {entityTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            )}
            {filteredFiles.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No files match this filter.</p>
            ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {filteredFiles.map(f => (
                  <tr key={f.id}>
                    <td className="font-medium">{f.file_name}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{f.entity_type.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--ink-faint)' }}>{fmtBytes(f.size_bytes)}</td>
                    <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(f.created_at)}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-sm inline-flex items-center gap-1" disabled={opening === f.id} onClick={() => open(f)}>
                        {opening === f.id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
