'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardAssuranceReportData, BoardAssuranceTrend } from '@/lib/boardAssurance/computeReport';
import type { ComplianceTwinBand } from '@/lib/complianceTwin/assemble';

export interface BoardAssuranceReportRow {
  id: string;
  year: number;
  quarter: number;
  status: 'draft' | 'issued';
  issuedAt: string | null;
  data: BoardAssuranceReportData;
  acknowledgementCount: number;
}

const BAND_COLOUR: Record<ComplianceTwinBand, string> = { red: 'var(--red)', amber: 'var(--gold)', green: 'var(--teal)' };
const BAND_LABEL: Record<ComplianceTwinBand, string> = { red: 'Needs attention', amber: 'Worth a look', green: 'On track' };
const TREND_LABEL: Record<BoardAssuranceTrend, string> = { improved: 'Improved', declined: 'Declined', unchanged: 'Unchanged' };

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_QUARTER = Math.floor(new Date().getMonth() / 3) + 1;

export default function BoardAssuranceClient({
  companyId, companyName, reports, loadError,
}: {
  companyId: string;
  companyName: string;
  reports: BoardAssuranceReportRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quarter, setQuarter] = useState(CURRENT_QUARTER);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/board-assurance/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, year, quarter }),
      });
      const body = await res.json();
      if (!res.ok) { setActionError(body.error ?? 'Could not generate the report.'); return; }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function regenerate(row: BoardAssuranceReportRow) {
    setGenerating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/board-assurance/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, year: row.year, quarter: row.quarter, regenerate: true }),
      });
      const body = await res.json();
      if (!res.ok) { setActionError(body.error ?? 'Could not regenerate the report.'); return; }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function issue(id: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/board-assurance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'issue' }),
    });
    const body = await res.json();
    if (!res.ok) { setActionError(body.error ?? 'Could not issue the report.'); return; }
    router.refresh();
  }

  async function printPdf(row: BoardAssuranceReportRow) {
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);
    const { buildBoardAssuranceReportPdf } = await import('@/lib/boardAssurance/buildReportPdf');
    const doc = buildBoardAssuranceReportPdf(jsPDF as any, autoTable, { companyName, data: row.data });
    doc.save(`board-assurance-${companyName.replace(/\s+/g, '-')}-Q${row.quarter}-${row.year}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Generate a new report</h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">Year</label>
            <input type="number" className="input" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 100 }} />
          </div>
          <div>
            <label className="label">Quarter</label>
            <select className="input" value={quarter} onChange={e => setQuarter(Number(e.target.value))} style={{ width: 100 }}>
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <button className="btn-cta btn-sm" disabled={generating} onClick={generate}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Assembles the Compliance Digital Twin, portfolio counts and the latest completed management review into a
          draft — nothing is shown to the client until you issue it.
        </p>
      </div>

      {(loadError || actionError) && (
        <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>{loadError ?? actionError}</p>
      )}

      {reports.length === 0 && !loadError && (
        <div className="card empty-state p-10">
          <p style={{ color: 'var(--ink-faint)' }}>No board assurance reports yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {reports.map(r => (
          <section key={r.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="badge" style={{ background: BAND_COLOUR[r.data.overallBand], color: 'white' }}>
                  {BAND_LABEL[r.data.overallBand]}
                </span>
                <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Q{r.quarter} {r.year}</span>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.status === 'issued' ? `Issued ${r.issuedAt ? new Date(r.issuedAt).toLocaleDateString('en-GB') : ''}` : 'Draft'}</span>
                {r.status === 'issued' && (
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {r.acknowledgementCount} acknowledgement{r.acknowledgementCount === 1 ? '' : 's'}
                  </span>
                )}
                {r.data.trend && (
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Trend: {TREND_LABEL[r.data.trend]}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  {expanded === r.id ? 'Hide detail' : 'View detail'}
                </button>
                <button className="btn-secondary btn-sm" onClick={() => printPdf(r)}>Print PDF</button>
                {r.status === 'draft' && (
                  <button className="btn-secondary btn-sm" disabled={generating} onClick={() => regenerate(r)}>
                    Regenerate
                  </button>
                )}
                {r.status === 'draft' && (
                  <button className="btn-cta btn-sm" onClick={() => issue(r.id)}>Issue</button>
                )}
              </div>
            </div>

            {expanded === r.id && (
              <div className="grid gap-3 md:grid-cols-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                {r.data.complianceTwin.areas.map(a => (
                  <div key={a.area} className="p-2" style={{ borderLeft: `3px solid ${BAND_COLOUR[a.band]}` }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{a.label}</p>
                    <ul className="text-xs space-y-0.5">
                      {a.reasons.map((reason, i) => <li key={i} style={{ color: 'var(--ink-soft)' }}>{reason}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
