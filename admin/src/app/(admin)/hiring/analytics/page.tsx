import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { BarChart3, Clock, Users, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

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

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(7,11,29,0.07)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

export default async function AdminHiringAnalyticsPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: reqs }, { data: candidates }, { data: offers }, { data: companies }] = await Promise.all([
    supabase.from('requisitions').select('id,title,stage,friction_level,assigned_recruiter,created_at,companies(id,name)').order('created_at', { ascending: false }),
    supabase.from('candidates').select('id,approved_for_client,client_status'),
    supabase.from('offers').select('id,status'),
    supabase.from('companies').select('id,name').eq('active', true),
  ]);

  const allReqs = reqs ?? [];
  const allCands = candidates ?? [];
  const allOffers = offers ?? [];
  const allCompanies = companies ?? [];

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

  // Candidate stats
  const totalCands = allCands.length;
  const sharedCands = allCands.filter(c => (c as any).approved_for_client).length;
  const approvedCands = allCands.filter(c => (c as any).client_status === 'approved').length;

  // Offer stats
  const acceptedOffers = allOffers.filter(o => (o as any).status === 'written_accepted');
  const declinedOffers = allOffers.filter(o => (o as any).status === 'declined');
  const offerAcceptRate = allOffers.length > 0
    ? Math.round((acceptedOffers.length / allOffers.length) * 100)
    : null;

  // Per-client breakdown
  const clientBreakdown = allCompanies.map(c => {
    const clientReqs = allReqs.filter(r => (r as any).companies?.id === c.id);
    const active = clientReqs.filter(r => !['filled', 'cancelled'].includes(r.stage)).length;
    const filled = clientReqs.filter(r => r.stage === 'filled').length;
    const highFriction = clientReqs.filter(r => ['High', 'Critical'].includes((r as any).friction_level ?? '')).length;
    return { id: c.id, name: c.name, total: clientReqs.length, active, filled, highFriction };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Recruiter breakdown
  const recruiterCounts: Record<string, number> = {};
  for (const r of allReqs) {
    const rec = (r as any).assigned_recruiter ?? 'Unassigned';
    recruiterCounts[rec] = (recruiterCounts[rec] ?? 0) + 1;
  }

  return (
    <>
      <AdminTopbar
        title="Hiring Analytics"
        subtitle="Cross-client hiring performance overview"
        actions={<Link href="/hiring" className="btn-secondary btn-sm">← All Roles</Link>}
      />
      <main className="admin-page flex-1 space-y-6">

        {/* ── Top stats ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Roles',    value: activeRoles.length,  sub: `${filledRoles.length} filled`,          icon: BarChart3,    color: 'var(--purple)' },
            { label: 'Avg Days Open',   value: `${avgDaysOpen}d`,   sub: 'across active roles',                   icon: Clock,        color: 'var(--blue)' },
            { label: 'Total Candidates', value: totalCands,          sub: `${sharedCands} shared`,                 icon: Users,        color: 'var(--teal)' },
            { label: 'Offers Made',     value: allOffers.length,    sub: offerAcceptRate != null ? `${offerAcceptRate}% accepted` : 'No offers yet', icon: CheckCircle2, color: '#16A34A' },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>{label}</p>
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: `${color}18` }}>
                  <Icon size={15} style={{ color }} />
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── Stage distribution ────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Roles by Stage</h2>
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
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Friction Distribution</h2>
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
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Candidate Funnel</h2>
            <div className="space-y-4">
              {[
                { label: 'Total in pipeline', value: totalCands,    color: 'var(--blue)' },
                { label: 'Shared with clients', value: sharedCands, color: 'var(--purple)' },
                { label: 'Approved by clients', value: approvedCands, color: '#16A34A' },
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

          {/* ── Recruiter breakdown ───────────────────────── */}
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Roles by Recruiter</h2>
            {Object.keys(recruiterCounts).length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No roles assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(recruiterCounts).sort(([, a], [, b]) => b - a).map(([rec, count]) => (
                  <div key={rec}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{rec}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{count}</span>
                    </div>
                    <Bar pct={(count / allReqs.length) * 100} color="var(--teal)" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Per-client breakdown ──────────────────────────── */}
        {clientBreakdown.length > 0 && (
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Per-Client Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    {['Client', 'Total Roles', 'Active', 'Filled', 'High/Critical Friction'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientBreakdown.map(c => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients/${c.id}`} className="font-medium hover:underline" style={{ color: 'var(--purple)' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td>{c.total}</td>
                      <td>{c.active}</td>
                      <td>{c.filled}</td>
                      <td>
                        {c.highFriction > 0 ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#DC2626' }}>
                            <AlertTriangle size={12} /> {c.highFriction}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Offer summary ─────────────────────────────────── */}
        {allOffers.length > 0 && (
          <div className="card p-6">
            <h2 className="font-display font-semibold text-sm mb-5" style={{ color: 'var(--ink)' }}>Offer Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Total Offers',  value: allOffers.length,    bg: 'rgba(59,111,255,0.08)',  color: '#1848CC' },
                { label: 'Accepted',      value: acceptedOffers.length, bg: 'rgba(22,163,74,0.08)', color: '#166534' },
                { label: 'Declined',      value: declinedOffers.length, bg: 'rgba(220,38,38,0.08)', color: '#991B1B' },
              ].map(({ label, value, bg, color }) => (
                <div key={label} className="rounded-[10px] p-4 text-center" style={{ background: bg }}>
                  <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide mt-1" style={{ color }}>{label}</p>
                </div>
              ))}
            </div>
            {offerAcceptRate != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Acceptance rate</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{offerAcceptRate}%</span>
                </div>
                <Bar pct={offerAcceptRate} color="#16A34A" />
              </div>
            )}
          </div>
        )}

      </main>
    </>
  );
}
