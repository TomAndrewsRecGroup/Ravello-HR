// Group Roll-Up Reporting (go-live gap list, item 6, 2026-10-02).
// One parent + its direct children, reusing today's client_health_
// snapshots row (107/168) and the SAME bucketing lib/briefing/compute.ts
// already uses for the Daily Briefing — scoped to this group alone.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { computeGroupRollup, type GroupCompanyRow } from '@/lib/groupRollup/compute';
import type { BriefingSnapshotRow } from '@/lib/briefing/compute';
import { ProportionBar } from '@/components/charts/MiniCharts';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = { title: 'Group Roll-Up' };
export const dynamic = 'force-dynamic';

const BAND_COLOUR: Record<string, string> = { red: 'var(--red)', amber: 'var(--gold)', green: 'var(--teal)' };
const SEVERITY_COLOUR: Record<string, string> = { critical: 'var(--red)', warning: 'var(--gold)' };

function gbp(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export default async function GroupRollupPage(props: { params: Promise<{ parentId: string }> }) {
  const { parentId } = await props.params;
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  // The parent itself plus its direct children only — bounded by the
  // one relationship the Organisations page's own dropdown creates,
  // never a scan of the whole companies table.
  const [{ data: parentRow }, childrenPage] = await Promise.all([
    supabase.from('companies').select('id, name, parent_organisation_id, monthly_retainer_pence, active')
      .eq('id', parentId).maybeSingle(),
    readAllPages<GroupCompanyRow>((from, to) =>
      supabase.from('companies').select('id, name, parent_organisation_id, monthly_retainer_pence, active')
        .eq('parent_organisation_id', parentId).order('id').range(from, to)),
  ]);
  const companyRows: GroupCompanyRow[] = parentRow ? [parentRow as GroupCompanyRow, ...childrenPage.rows] : childrenPage.rows;
  const memberIds = companyRows.map(c => c.id);

  const { rows: snapshots, error: snapError } = memberIds.length === 0
    ? { rows: [] as BriefingSnapshotRow[], error: null }
    : await readAllPages<BriefingSnapshotRow>((from, to) =>
        supabase.from('client_health_snapshots').select('*').eq('snapshot_date', today).in('company_id', memberIds).order('id').range(from, to));

  const rollup = computeGroupRollup(parentId, companyRows, today, snapshots);
  if (!rollup) return notFound();

  return (
    <div className="space-y-4">
      <Link href="/clients/groups" className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--ink-soft)' }}>
        <ArrowLeft size={14} /> All groups
      </Link>

      <div className="card p-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{rollup.parentName} &ndash; group roll-up</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-faint)' }}>
          {rollup.members.length} compan{rollup.members.length === 1 ? 'y' : 'ies'} in this group.
          {snapError && <span style={{ color: 'var(--red)' }}> Today&rsquo;s health snapshot could not be loaded.</span>}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Combined monthly retainer</p>
          <p className="text-2xl font-semibold">{gbp(rollup.totalMonthlyRetainerPence)}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.red}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Red</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.red }}>{rollup.briefing.redCompanies}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.amber}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Amber</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.amber }}>{rollup.briefing.amberCompanies}</p>
        </div>
        <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.green}` }}>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Nothing flagged</p>
          <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.green }}>{rollup.briefing.cleanCompanies}</p>
        </div>
      </div>

      {rollup.briefing.totalCompanies > 0 && (
        // Every member company falls into exactly one band today — the
        // same genuine proportion-of-one-whole shape the Daily Briefing
        // page (this rollup's own source: lib/briefing/compute.ts) now
        // shows the same way.
        <div className="card p-4">
          <ProportionBar showLegend={false} segments={[
            { value: rollup.briefing.redCompanies,   colour: BAND_COLOUR.red,   label: 'Red' },
            { value: rollup.briefing.amberCompanies, colour: BAND_COLOUR.amber, label: 'Amber' },
            { value: rollup.briefing.cleanCompanies, colour: BAND_COLOUR.green, label: 'Nothing flagged' },
          ]} />
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-base font-medium mb-3" style={{ color: 'var(--ink)' }}>Members</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Company</th><th style={{ textAlign: 'right' }}>Monthly retainer</th></tr></thead>
            <tbody>
              {rollup.members.map(m => (
                <tr key={m.companyId}>
                  <td>
                    <Link href={`/clients/${m.companyId}`} style={{ color: 'var(--purple)' }}>{m.companyName}</Link>
                    {m.isParent && <span className="badge ml-2">Parent</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{gbp(m.monthlyRetainerPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-medium mb-3" style={{ color: 'var(--ink)' }}>What needs attention across the group</h2>
        {rollup.briefing.flags.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing is flagged across this group today.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Company</th><th>What</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {rollup.briefing.flags.map((f, i) => (
                  <tr key={i}>
                    <td><Link href={`/health-safety/${f.companyId}/core-360-status`} style={{ color: 'var(--purple)' }}>{f.companyName}</Link></td>
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
    </div>
  );
}
