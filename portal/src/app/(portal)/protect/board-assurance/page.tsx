import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import BoardAssuranceAcknowledge from './BoardAssuranceAcknowledge';
import type { BoardAssuranceReportData } from './types';

export const metadata: Metadata = { title: 'Board Assurance' };
export const dynamic = 'force-dynamic';

const BAND_LABEL: Record<string, string> = { red: 'Needs attention', amber: 'Worth a look', green: 'On track' };
const BAND_COLOUR: Record<string, string> = { red: 'var(--red)', amber: 'var(--gold)', green: 'var(--teal)' };
const TREND_LABEL: Record<string, string> = { improved: 'Improved', declined: 'Declined', unchanged: 'Unchanged' };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

interface ReportRow {
  id: string;
  year: number;
  quarter: number;
  issued_at: string | null;
  report_data: BoardAssuranceReportData;
}

interface AckRow {
  report_id: string;
  acknowledged_by_name: string;
  comment: string | null;
  acknowledged_at: string;
}

// Core-OS 360 Phase 13, Group 2. Read-only, ISSUED reports only — RLS
// (board_assurance_reports_client_read, migration 178) already refuses
// a draft to a client session; this page's own .eq('status', 'issued')
// is the same defence-in-depth every other read-only PROTECT page in
// this codebase already carries (see /protect/documents' effective_from
// filter, /protect/legal-register's own comment). A board member
// acknowledges an issued report from here; BoardAssuranceAcknowledge
// inserts directly under the session (RLS + the fill trigger do the
// real work), the exact RamsAcknowledge.tsx pattern.
export default async function ProtectBoardAssurancePage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: reports, error } = await supabase
    .from('board_assurance_reports')
    .select('id, year, quarter, issued_at, report_data')
    .eq('company_id', companyId)
    .eq('status', 'issued')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(40);

  const reportRows = (reports ?? []) as ReportRow[];
  const reportIds = reportRows.map(r => r.id);

  const { data: acks, error: ackError } = reportIds.length > 0
    ? await supabase.from('board_assurance_acknowledgements')
        .select('report_id, acknowledged_by_name, comment, acknowledged_at')
        .in('report_id', reportIds).order('acknowledged_at', { ascending: false })
    : { data: [] as AckRow[], error: null };

  const acksByReport = new Map<string, AckRow[]>();
  for (const a of (acks ?? []) as AckRow[]) {
    const list = acksByReport.get(a.report_id) ?? [];
    list.push(a);
    acksByReport.set(a.report_id, list);
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      {(error || ackError) && (
        <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>
          Board assurance reports could not be loaded. Refresh to try again.
        </p>
      )}

      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        A quarterly summary of your organisation&rsquo;s compliance position across Safety, Governance, Risk,
        Incidents and Evidence, assembled from the same records shown throughout this platform. Once issued,
        a board member can read it here and record that they have reviewed it.
      </div>

      {reportRows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ShieldCheck size={28} style={{ color: 'var(--blue)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>
              No board assurance reports have been issued yet
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {reportRows.map(r => {
            const acknowledgements = acksByReport.get(r.id) ?? [];
            return (
              <section key={r.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="badge" style={{ background: BAND_COLOUR[r.report_data.overallBand], color: 'white' }}>
                    {BAND_LABEL[r.report_data.overallBand] ?? r.report_data.overallBand}
                  </span>
                  <strong>Q{r.quarter} {r.year}</strong>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Issued {fmt(r.issued_at)}</span>
                  {r.report_data.trend && (
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      Trend: {TREND_LABEL[r.report_data.trend] ?? r.report_data.trend}
                    </span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {r.report_data.complianceTwin.areas.map(a => (
                    <div key={a.area} className="p-2" style={{ borderLeft: `3px solid ${BAND_COLOUR[a.band]}` }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{a.label}</p>
                      <ul className="text-xs space-y-0.5">
                        {a.reasons.map((reason, i) => <li key={i} style={{ color: 'var(--ink-soft)' }}>{reason}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>
                    {acknowledgements.length === 0
                      ? 'No board member has acknowledged this report yet.'
                      : `Acknowledged by ${acknowledgements.length} board member${acknowledgements.length === 1 ? '' : 's'}:`}
                  </p>
                  {acknowledgements.length > 0 && (
                    <ul className="space-y-1">
                      {acknowledgements.map((a, i) => (
                        <li key={i} className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                          <strong>{a.acknowledged_by_name}</strong> — {fmt(a.acknowledged_at)}
                          {a.comment && <span> &mdash; &ldquo;{a.comment}&rdquo;</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <BoardAssuranceAcknowledge reportId={r.id} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
