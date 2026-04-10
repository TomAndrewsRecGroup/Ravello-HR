import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import Link from 'next/link';
import { TrendingUp, Clock, Users, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react';

export const metadata: Metadata = { title: 'Hiring Analytics' };
export const revalidate = 60;

const STAGE_ORDER = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer', 'filled', 'cancelled'];
const STAGE_LABELS: Record<string, string> = {
  submitted: 'Submitted', in_progress: 'In Progress', shortlist_ready: 'Shortlist Ready',
  interview: 'Interview', offer: 'Offer', filled: 'Filled', cancelled: 'Cancelled',
};
const FRICTION_COLORS: Record<string, string> = {
  Low: '#16A34A', Medium: '#D97706', High: '#DC2626', Critical: '#7F1D1D', Unknown: '#94A3B8',
};

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>{label}</p>
        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{sub}</p>}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

export default async function HiringAnalyticsPage() {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  if (!companyId) return (
    <main className="portal-page flex-1">
      <div className="card p-12 text-center">
        <div className="empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
        </div>
      </div>
    </main>
  );

  const [{ data: reqs }, { data: candidates }, { data: offers }] = await Promise.all([
    supabase.from('requisitions').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('candidates').select('*').eq('company_id', companyId),
    supabase.from('offers').select('*').eq('company_id', companyId),
  ]);

  const allReqs = reqs ?? [];
  const allCands = candidates ?? [];
  const allOffers = offers ?? [];

  // ── Computed stats ──────────────────────────────────────────
  const activeRoles = allReqs.filter(r => !['filled', 'cancelled'].includes(r.stage));
  const filledRoles = allReqs.filter(r => r.stage === 'filled');
  const avgDaysOpen = activeRoles.length
    ? Math.round(activeRoles.reduce((sum, r) => sum + daysOpen(r.created_at), 0) / activeRoles.length)
    : 0;

  // Stage distribution
  const stageCounts: Record<string, number> = {};
  for (const r of allReqs) {
    stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;
  }
  const maxStageCount = Math.max(...Object.values(stageCounts), 1);

  // Friction distribution
  const frictionCounts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0, Unknown: 0 };
  for (const r of allReqs) {
    const level = (r as any).friction_level ?? 'Unknown';
    frictionCounts[level] = (frictionCounts[level] ?? 0) + 1;
  }

  // Candidate funnel
  const totalCands = allCands.length;
  const sharedCands = allCands.filter(c => (c as any).approved_for_client).length;
  const approvedCands = allCands.filter(c => (c as any).client_status === 'approved').length;
  const rejectedCands = allCands.filter(c => (c as any).client_status === 'rejected').length;

  // Offer stats
  const activeOffers = allOffers.filter(o => !['declined', 'withdrawn', 'lapsed'].includes((o as any).status));
  const acceptedOffers = allOffers.filter(o => (o as any).status === 'written_accepted');
  const declinedOffers = allOffers.filter(o => (o as any).status === 'declined');
  const offerAcceptRate = allOffers.length > 0
    ? Math.round((acceptedOffers.length / allOffers.length) * 100)
    : null;

  // Roles by working model
  const modelCounts: Record<string, number> = {};
  for (const r of allReqs) {
    const m = (r as any).working_model ?? 'unknown';
    modelCounts[m] = (modelCounts[m] ?? 0) + 1;
  }

  return (
    <>
      <Topbar
        title="Hiring Analytics"
        subtitle="Performance overview for your active and completed roles"
        actions={<Link href="/hire/hiring" className="btn-secondary btn-sm">← All Roles</Link>}
      />
      <main className="portal-page flex-1 space-y-6">

        {/* ── Top stats ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Roles"    value={activeRoles.length}  sub={`${filledRoles.length} filled`}          icon={BarChart3}    color="var(--purple)" />
          <StatCard label="Avg Days Open"   value={`${avgDaysOpen}d`}   sub="across active roles"                     icon={Clock}        color="var(--blue)" />
          <StatCard label="Total Candidates" value={totalCands}          sub={`${sharedCands} shared with you`}        icon={Users}        color="var(--teal)" />
          <StatCard label="Offers Made"     value={allOffers.length}    sub={offerAcceptRate != null ? `${offerAcceptRate}% accepted` : 'No offers yet'} icon={CheckCircle2} color="#16A34A" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── Stage distribution ────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
              Roles by Stage
            </h2>
            {allReqs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No roles yet.</p>
            ) : (
              <div className="space-y-3">
                {STAGE_ORDER.filter(s => stageCounts[s]).map(s => (
                  <div key={s}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{STAGE_LABELS[s]}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{stageCounts[s]}</span>
                    </div>
                    <Bar pct={(stageCounts[s] / maxStageCount) * 100} color="var(--purple)" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Friction distribution ─────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
              Friction Lens Distribution
            </h2>
            {allReqs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No roles yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(frictionCounts).filter(([, v]) => v > 0).map(([level, count]) => (
                  <div key={level}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{level} Friction</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{count}</span>
                    </div>
                    <Bar pct={(count / allReqs.length) * 100} color={FRICTION_COLORS[level] ?? '#94A3B8'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Candidate funnel ──────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
              Candidate Funnel
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Total in pipeline',  value: totalCands,    color: 'var(--blue)' },
                { label: 'Shared with you',    value: sharedCands,   color: 'var(--purple)' },
                { label: 'Approved by you',    value: approvedCands, color: 'var(--success)' },
                { label: 'Not progressed',     value: rejectedCands, color: 'var(--danger)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{value}</span>
                  </div>
                  <Bar pct={totalCands > 0 ? (value / totalCands) * 100 : 0} color={color} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Offer summary ─────────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
              Offer Summary
            </h2>
            {allOffers.length === 0 ? (
              <div className="empty-state py-6">
                <CheckCircle2 size={20} />
                <p className="text-sm">No offers yet</p>
                <p className="text-xs max-w-[220px]">Offers will appear here once your consultant creates them for approved candidates.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Active',   value: activeOffers.length,  bg: 'rgba(59,111,255,0.08)',  color: 'var(--blue)' },
                    { label: 'Accepted', value: acceptedOffers.length, bg: 'rgba(22,163,74,0.08)',  color: 'var(--emerald)' },
                    { label: 'Declined', value: declinedOffers.length, bg: 'rgba(220,38,38,0.08)',  color: 'var(--rose)' },
                  ].map(({ label, value, bg, color }) => (
                    <div key={label} className="rounded-[10px] p-3 text-center" style={{ background: bg }}>
                      <p className="text-lg font-bold" style={{ color }}>{value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color }}>{label}</p>
                    </div>
                  ))}
                </div>
                {offerAcceptRate != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Acceptance rate</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{offerAcceptRate}%</span>
                    </div>
                    <Bar pct={offerAcceptRate} color="var(--success)" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Working model breakdown ───────────────────────── */}
        {Object.keys(modelCounts).length > 0 && (
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>
              Roles by Working Model
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(modelCounts).map(([model, count]) => (
                <div
                  key={model}
                  className="rounded-[10px] px-4 py-3 flex items-center gap-3"
                  style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}
                >
                  <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{count}</span>
                  <span className="text-sm capitalize" style={{ color: 'var(--ink-soft)' }}>{model}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── High friction alert ───────────────────────────── */}
        {(frictionCounts.High + frictionCounts.Critical) > 0 && (
          <div
            className="card p-5 flex items-start gap-4"
            style={{ borderLeft: '3px solid var(--danger)', background: 'rgba(220,38,38,0.03)' }}
          >
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <div>
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                {frictionCounts.High + frictionCounts.Critical} role{(frictionCounts.High + frictionCounts.Critical) > 1 ? 's' : ''} with High or Critical friction
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                These roles are at risk of taking significantly longer to fill. Your consultant at The People Office will have recommendations — check the individual role pages for details.
              </p>
              <Link href="/hire/hiring" className="btn-secondary btn-sm mt-3 inline-flex">
                View Roles →
              </Link>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
