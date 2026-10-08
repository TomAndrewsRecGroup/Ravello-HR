// Daily Management Briefing (go-live gap list, item 9, 2026-10-02).
// "What needs attention today" across the whole portfolio, for staff —
// genuinely different from /health (a per-client RAG roll-up a staff
// member has to open client-by-client) and from the per-client
// WhatChangedTab (a single client's create/update/delete retrospective).
// Pure composition over today's already-written client_health_snapshots
// row (lib/briefing/compute.ts) — no new table, no AI, no score.
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { assembleDailyBriefing, type BriefingSnapshotRow } from '@/lib/briefing/compute';
import { ProportionBar } from '@/components/charts/MiniCharts';
import { Sunrise, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Daily Briefing' };
export const dynamic = 'force-dynamic';

const SEVERITY_COLOUR: Record<string, string> = { critical: 'var(--red)', warning: 'var(--gold)' };
const BAND_COLOUR: Record<string, string> = { red: 'var(--red)', amber: 'var(--gold)', green: 'var(--teal)' };

function fmt(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function BriefingPage() {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const [companiesPage, snapshotTodayPage] = await Promise.all([
    readAllPages<{ id: string; name: string }>((from, to) =>
      supabase.from('companies').select('id, name').eq('active', true).order('id').range(from, to)),
    readAllPages<BriefingSnapshotRow>((from, to) =>
      supabase.from('client_health_snapshots').select('*').eq('snapshot_date', today).order('id').range(from, to)),
  ]);

  // The cron writes at 06:45 UTC — a page load before that (or a
  // missed run) should still show something useful rather than an
  // empty page, so fall back to yesterday's row and say so plainly
  // rather than silently presenting a stale date as current.
  let snapshotDate = today;
  let snapshotRows: BriefingSnapshotRow[] = snapshotTodayPage.rows;
  let snapshotError = snapshotTodayPage.error;
  if (snapshotRows.length === 0 && !snapshotError) {
    const fallback = await readAllPages<BriefingSnapshotRow>((from, to) =>
      supabase.from('client_health_snapshots').select('*').eq('snapshot_date', yesterday).order('id').range(from, to));
    if (fallback.rows.length > 0) {
      snapshotDate = yesterday;
      snapshotRows = fallback.rows;
    }
    snapshotError = snapshotError ?? fallback.error;
  }

  const companyNames = new Map(companiesPage.rows.map(c => [c.id, c.name]));
  const briefing = assembleDailyBriefing(snapshotDate, snapshotRows as unknown as BriefingSnapshotRow[], companyNames);
  const isStale = snapshotDate !== today;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <Sunrise size={22} style={{ color: 'var(--purple)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Daily Management Briefing</h1>
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
          {fmt(briefing.date)}{isStale && ' — today’s snapshot has not run yet; showing the most recent one.'}
        </p>
      </div>

      {snapshotError && (
        <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>The briefing could not be loaded. Refresh to try again.</p>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Clients tracked</p>
          <p className="text-2xl font-semibold">{briefing.totalCompanies}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.red}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Red</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.red }}>{briefing.redCompanies}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.amber}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Amber</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.amber }}>{briefing.amberCompanies}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.green}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Nothing flagged</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.green }}>{briefing.cleanCompanies}</p>
        </div>
      </div>

      {briefing.totalCompanies > 0 && (
        // Every tracked company falls into exactly one band today — a
        // genuine proportion of one whole, the same shape ProportionBar
        // already serves for Hiring Analytics' offer outcomes and HR
        // Dashboard's gender split. showLegend is off: the four tiles
        // above already name each count.
        <div className="card p-4">
          <ProportionBar showLegend={false} segments={[
            { value: briefing.redCompanies,   colour: BAND_COLOUR.red,   label: 'Red' },
            { value: briefing.amberCompanies, colour: BAND_COLOUR.amber, label: 'Amber' },
            { value: briefing.cleanCompanies, colour: BAND_COLOUR.green, label: 'Nothing flagged' },
          ]} />
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-base font-medium mb-3" style={{ color: 'var(--ink)' }}>What needs attention today</h2>
        {briefing.flags.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing is flagged across the portfolio today.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Client</th><th>What</th><th style={{ textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {briefing.flags.map((f, i) => (
                  <tr key={i}>
                    <td>
                      <Link href={`/health-safety/${f.companyId}/core-360-status`} style={{ color: 'var(--purple)' }}>
                        {f.companyName}
                      </Link>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        {f.severity === 'critical' && <AlertTriangle size={13} style={{ color: SEVERITY_COLOUR.critical }} />}
                        <span style={{ color: f.severity === 'critical' ? SEVERITY_COLOUR.critical : 'var(--ink-soft)' }}>{f.reason}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{f.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {briefing.companies.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-medium mb-3" style={{ color: 'var(--ink)' }}>Clients, by how much needs attention</h2>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Client</th><th>Band</th><th style={{ textAlign: 'right' }}>Flags</th></tr></thead>
              <tbody>
                {briefing.companies.filter(c => c.flagCount > 0).map(c => (
                  <tr key={c.companyId}>
                    <td>
                      <Link href={`/health-safety/${c.companyId}/core-360-status`} style={{ color: 'var(--purple)' }}>
                        {c.companyName}
                      </Link>
                    </td>
                    <td><span className="badge" style={{ background: BAND_COLOUR[c.band], color: 'white' }}>{c.band}</span></td>
                    <td style={{ textAlign: 'right' }}>{c.flagCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
