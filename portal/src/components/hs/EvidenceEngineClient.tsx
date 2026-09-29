'use client';

import { useState } from 'react';
import { FileText, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { evidenceUrl } from '@/lib/hs/evidence';
import type { EvidenceCoverageSummary } from '@/lib/evidenceEngine/analyze';

export interface EvidenceFileListRow {
  id: string;
  entity_type: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
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
export default function EvidenceEngineClient({ files, coverage }: {
  files: EvidenceFileListRow[];
  coverage: EvidenceCoverageSummary;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');

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
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Register item</th><th>Outcome</th><th>Completed</th></tr></thead>
                  <tbody>
                    {coverage.gaps.slice(0, 50).map(g => (
                      <tr key={g.completionId}>
                        <td className="font-medium">{g.itemTitle}</td>
                        <td style={{ color: g.outcome === 'fail' ? 'var(--red)' : 'var(--ink-soft)' }}>{g.outcome.replace(/_/g, ' ')}</td>
                        <td style={{ color: 'var(--ink-faint)' }}>{fmtDate(g.completedOn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {coverage.gaps.length > 50 && (
                  <p className="text-xs p-2" style={{ color: 'var(--ink-faint)' }}>Showing the 50 most recent of {coverage.gaps.length}.</p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={18} style={{ color: 'var(--blue)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Evidence library</h2>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {files.length === 0 ? (
          <div className="empty-state p-6"><p style={{ color: 'var(--ink-faint)' }}>No evidence uploaded yet.</p></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {files.map(f => (
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
      </section>
    </div>
  );
}
