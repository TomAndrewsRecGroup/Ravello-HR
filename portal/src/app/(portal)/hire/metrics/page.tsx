import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BarChart3, Briefcase, ShieldCheck, LifeBuoy, FolderOpen, Bell, TrendingUp } from 'lucide-react';

export const metadata: Metadata = { title: 'Metrics' };

/* ── Helpers ──────────────────────────────────────────────── */

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function StatCard({ label, value, sub, color = 'var(--purple)' }: {
  label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-faint)' }}>{label}</p>
      <p className="font-display font-bold text-3xl" style={{ color: 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{sub}</p>}
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{value}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = 'var(--purple)' }: {
  icon: React.ElementType; title: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h2>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default async function MetricsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, companies(feature_flags, name)')
    .eq('id', user?.id ?? '')
    .single();

  const companyId: string = (profile as any)?.company_id ?? '';
  const flags: Record<string, boolean> = (profile as any)?.companies?.feature_flags ?? {};

  if (flags.metrics === false) {
    return (
        <main className="portal-page flex-1">
          <div className="card p-12">
            <div className="empty-state">
              <BarChart3 size={28} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Metrics not enabled</p>
              <p className="text-sm max-w-[300px] text-center" style={{ color: 'var(--ink-faint)' }}>
                Analytics and reporting insights are available on higher-tier plans. Contact The People Office to upgrade.
              </p>
              <a href="mailto:hello@thepeopleoffice.co.uk?subject=Metrics module" className="btn-cta btn-sm mt-1">
                Get in touch
              </a>
            </div>
          </div>
        </main>
    );
  }

  /* ── Fetch all data in parallel ── */
  const [reqRes, candRes, compRes, tickRes, docRes, actRes,
    trainingRes, reviewsRes, absenceRes, empDocRes] = await Promise.all([
    supabase.from('requisitions').select('id,title,stage,friction_level,created_at').eq('company_id', companyId),
    supabase.from('candidates').select('id,client_status,approved_for_client,requisition_id').eq('company_id', companyId),
    supabase.from('compliance_items').select('id,status,category,due_date').eq('company_id', companyId),
    supabase.from('tickets').select('id,status,priority,created_at,resolved_at').eq('company_id', companyId),
    supabase.from('documents').select('id,category,approved_at').eq('company_id', companyId),
    supabase.from('actions').select('id,status,priority').eq('company_id', companyId),
    flags.lead !== false
      ? supabase.from('training_needs').select('id,status').eq('company_id', companyId)
      : Promise.resolve({ data: null }),
    flags.lead !== false
      ? supabase.from('performance_reviews').select('id,status').eq('company_id', companyId)
      : Promise.resolve({ data: null }),
    flags.protect !== false
      ? supabase.from('absence_records').select('id,status,absence_type').eq('company_id', companyId)
      : Promise.resolve({ data: null }),
    flags.protect !== false
      ? supabase.from('employee_documents').select('id,status,expiry_date').eq('company_id', companyId)
      : Promise.resolve({ data: null }),
  ]);

  const reqs        = reqRes.data       ?? [];
  const candidates  = candRes.data      ?? [];
  const compItems   = compRes.data      ?? [];
  const tickets     = tickRes.data      ?? [];
  const docs        = docRes.data       ?? [];
  const actions     = actRes.data       ?? [];
  const trainNeeds  = trainingRes.data  ?? [];
  const perfReviews = reviewsRes.data   ?? [];
  const absences    = absenceRes.data   ?? [];
  const empDocs     = empDocRes.data    ?? [];

  /* ── Hiring stats ── */
  const activeReqs     = reqs.filter(r => !['filled','cancelled'].includes(r.stage));
  const filledReqs     = reqs.filter(r => r.stage === 'filled');
  const avgDaysOpen    = activeReqs.length
    ? Math.round(activeReqs.reduce((s, r) => s + daysOpen(r.created_at), 0) / activeReqs.length)
    : 0;

  const stageOrder = ['submitted','in_progress','shortlist_ready','interview','offer','filled'];
  const stageCounts = stageOrder.map(s => ({
    label: s === 'shortlist_ready' ? 'Shortlist' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1),
    value: reqs.filter(r => r.stage === s).length,
  }));
  const maxStage = Math.max(...stageCounts.map(s => s.value), 1);

  const frictionDist = ['Low','Medium','High','Critical','Unknown'].map(level => ({
    label: level,
    value: activeReqs.filter(r => (r.friction_level ?? 'Unknown') === level).length,
    color: level === 'Low' ? '#16A34A' : level === 'Medium' ? '#D97706' : level === 'High' ? '#DC2626' : level === 'Critical' ? '#7F1D1D' : '#94A3B8',
  })).filter(f => f.value > 0);

  /* ── Candidate stats ── */
  const sharedCands   = candidates.filter(c => c.approved_for_client);
  const pendingCands  = sharedCands.filter(c => c.client_status === 'pending');
  const approvedCands = sharedCands.filter(c => c.client_status === 'approved');
  const rejectedCands = sharedCands.filter(c => c.client_status === 'rejected');

  /* ── Compliance stats ── */
  const compOverdue  = compItems.filter(c => c.status !== 'complete' && new Date(c.due_date) < new Date());
  const compComplete = compItems.filter(c => c.status === 'complete');
  const compPending  = compItems.filter(c => c.status === 'pending' && !compOverdue.includes(c));
  const compReview   = compItems.filter(c => c.status === 'in_review');
  const compRate     = pct(compComplete.length, compItems.length);

  const compByCat: Record<string, number> = {};
  for (const ci of compItems) { compByCat[ci.category] = (compByCat[ci.category] ?? 0) + 1; }
  const maxCat = Math.max(...Object.values(compByCat), 1);

  /* ── Support stats ── */
  const openTickets     = tickets.filter(t => !['resolved','closed'].includes(t.status));
  const resolvedTickets = tickets.filter(t => ['resolved','closed'].includes(t.status));
  const urgentTickets   = openTickets.filter(t => t.priority === 'urgent' || t.priority === 'high');

  const ticketPrios = ['urgent','high','normal','low'].map(p => ({
    label: p.charAt(0).toUpperCase() + p.slice(1),
    value: tickets.filter(t => t.priority === p).length,
    color: p === 'urgent' ? '#DC2626' : p === 'high' ? '#D97706' : p === 'normal' ? 'var(--blue)' : '#94A3B8',
  })).filter(p => p.value > 0);
  const maxPrio = Math.max(...ticketPrios.map(p => p.value), 1);

  /* ── Documents stats ── */
  const approvedDocs = docs.filter(d => d.approved_at);
  const docByCat: Record<string, number> = {};
  for (const d of docs) { docByCat[d.category ?? 'other'] = (docByCat[d.category ?? 'other'] ?? 0) + 1; }
  const maxDoc = Math.max(...Object.values(docByCat), 1);

  /* ── Actions stats ── */
  const activeActions   = actions.filter(a => a.status === 'active');
  const completeActions = actions.filter(a => a.status === 'complete');
  const actionRate      = pct(completeActions.length, actions.length);

  /* ── LEAD stats ── */
  const openTraining      = trainNeeds.filter((t: any) => t.status === 'open').length;
  const completedTraining = trainNeeds.filter((t: any) => t.status === 'completed').length;
  const pendingReviews    = perfReviews.filter((r: any) => r.status === 'pending').length;
  const completedReviews  = perfReviews.filter((r: any) => r.status === 'completed').length;

  /* ── PROTECT stats ── */
  const pendingAbsences  = absences.filter((a: any) => a.status === 'pending').length;
  const approvedAbsences = absences.filter((a: any) => a.status === 'approved').length;
  const today = new Date();
  const in30  = new Date(today); in30.setDate(today.getDate() + 30);
  const expiredEmpDocs  = empDocs.filter((d: any) => d.expiry_date && new Date(d.expiry_date) < today).length;
  const expiringEmpDocs = empDocs.filter((d: any) => d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= in30).length;

  const highActions   = activeActions.filter(a => a.priority === 'high').length;
  const mediumActions = activeActions.filter(a => a.priority === 'medium').length;
  const lowActions    = activeActions.filter(a => a.priority === 'low').length;

  return (
      <main className="portal-page flex-1">

        {/* ── Top stat row ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label="Active Roles"       value={activeReqs.length}   color="var(--purple)" />
          <StatCard label="Roles Filled"       value={filledReqs.length}   color="var(--teal)" />
          <StatCard label="Avg Days Open"      value={`${avgDaysOpen}d`}   color="var(--blue)" />
          <StatCard label="Compliance Rate"    value={`${compRate}%`}      color={compRate >= 80 ? '#16A34A' : compRate >= 50 ? '#D97706' : '#DC2626'} />
          <StatCard label="Open Tickets"       value={openTickets.length}  color="#D97706" />
          <StatCard label="Actions Completed"  value={`${actionRate}%`}    color="var(--teal)" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── Hiring pipeline ─────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={Briefcase} title="Hiring Pipeline" color="var(--purple)" />
            {reqs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No roles yet.</p>
            ) : (
              <>
                <div className="space-y-3 mb-5">
                  {stageCounts.filter(s => s.value > 0).map(s => (
                    <BarRow key={s.label} label={s.label} value={s.value} max={maxStage} color="var(--purple)" />
                  ))}
                </div>
                {frictionDist.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-faint)' }}>
                      Friction Distribution (active roles)
                    </p>
                    <div className="space-y-2">
                      {frictionDist.map(f => (
                        <BarRow key={f.label} label={f.label} value={f.value} max={activeReqs.length} color={f.color} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Candidates ──────────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={TrendingUp} title="Candidate Pipeline" color="var(--teal)" />
            {sharedCands.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No candidates shared yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { label: 'Shared with You',    value: sharedCands.length,   color: 'var(--surface-alt)' },
                    { label: 'Awaiting Feedback',  value: pendingCands.length,  color: 'rgba(217,119,6,0.08)' },
                    { label: 'Approved',           value: approvedCands.length, color: 'rgba(22,163,74,0.08)' },
                    { label: 'Passed',             value: rejectedCands.length, color: 'rgba(220,38,38,0.06)' },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-3" style={{ background: s.color }}>
                      <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                      <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {sharedCands.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>Feedback rate</p>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct(approvedCands.length + rejectedCands.length, sharedCands.length)}%`, background: 'var(--teal)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                      {pct(approvedCands.length + rejectedCands.length, sharedCands.length)}% of shared candidates reviewed
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Compliance ──────────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={ShieldCheck} title="Compliance" color="#D97706" />
            {compItems.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No compliance items.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
                  {[
                    { label: 'Overdue',   value: compOverdue.length,  bg: 'rgba(220,38,38,0.08)',   text: '#991B1B' },
                    { label: 'Pending',   value: compPending.length,  bg: 'rgba(217,119,6,0.08)',   text: '#92400E' },
                    { label: 'In Review', value: compReview.length,   bg: 'rgba(59,130,246,0.08)',  text: '#1D4ED8' },
                    { label: 'Complete',  value: compComplete.length, bg: 'rgba(22,163,74,0.08)',   text: '#166534' },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-3 text-center" style={{ background: s.bg }}>
                      <p className="font-display font-bold text-2xl" style={{ color: s.text }}>{s.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: s.text, opacity: 0.8 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>Completion rate</p>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                    <div className="h-full rounded-full" style={{ width: `${compRate}%`, background: compRate >= 80 ? '#16A34A' : '#D97706' }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{compRate}% complete</p>
                </div>
                {Object.keys(compByCat).length > 1 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>By Category</p>
                    {Object.entries(compByCat).sort((a,b) => b[1]-a[1]).map(([cat, n]) => (
                      <BarRow key={cat} label={cat.replace(/_/g,' ')} value={n} max={maxCat} color="#D97706" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Support ─────────────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={LifeBuoy} title="HR Support" color="var(--teal)" />
            {tickets.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No tickets raised.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Total',    value: tickets.length,        bg: 'var(--surface-alt)' },
                    { label: 'Open',     value: openTickets.length,    bg: 'rgba(217,119,6,0.08)' },
                    { label: 'Resolved', value: resolvedTickets.length, bg: 'rgba(22,163,74,0.08)' },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-3 text-center" style={{ background: s.bg }}>
                      <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{s.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {urgentTickets.length > 0 && (
                  <div className="rounded-[10px] px-4 py-3 mb-4 flex items-center gap-2"
                    style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    <p className="text-xs font-semibold" style={{ color: '#991B1B' }}>
                      {urgentTickets.length} urgent/high priority ticket{urgentTickets.length !== 1 ? 's' : ''} open
                    </p>
                  </div>
                )}
                {ticketPrios.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>By Priority</p>
                    {ticketPrios.map(p => (
                      <BarRow key={p.label} label={p.label} value={p.value} max={maxPrio} color={p.color} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Documents ───────────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={FolderOpen} title="Documents" color="var(--blue)" />
            {docs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No documents uploaded.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Total',    value: docs.length },
                    { label: 'Approved', value: approvedDocs.length },
                    { label: 'Pending',  value: docs.length - approvedDocs.length },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-3 text-center" style={{ background: 'var(--surface-alt)' }}>
                      <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{s.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {Object.keys(docByCat).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>By Category</p>
                    {Object.entries(docByCat).sort((a,b) => b[1]-a[1]).map(([cat, n]) => (
                      <BarRow key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} value={n} max={maxDoc} color="var(--blue)" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Actions ─────────────────────────────────── */}
          <div className="card p-6">
            <SectionHeader icon={Bell} title="Actions" color="var(--purple)" />
            {actions.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No actions created.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Total',    value: actions.length },
                    { label: 'Active',   value: activeActions.length },
                    { label: 'Complete', value: completeActions.length },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-3 text-center" style={{ background: 'var(--surface-alt)' }}>
                      <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{s.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>Completion rate</p>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                    <div className="h-full rounded-full" style={{ width: `${actionRate}%`, background: 'var(--teal)' }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{actionRate}% complete</p>
                </div>
                {activeActions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-faint)' }}>Active by Priority</p>
                    {[
                      { label: 'High',   value: highActions,   color: '#DC2626' },
                      { label: 'Medium', value: mediumActions, color: '#D97706' },
                      { label: 'Low',    value: lowActions,    color: '#94A3B8' },
                    ].filter(p => p.value > 0).map(p => (
                      <BarRow key={p.label} label={p.label} value={p.value} max={activeActions.length} color={p.color} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* LEAD Module metrics */}
        {flags.lead !== false && trainNeeds.length + perfReviews.length > 0 && (
          <div className="card p-6 mt-6">
            <SectionHeader icon={TrendingUp} title="LEAD — People Development" color="var(--teal)" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Open Training Needs"      value={openTraining}      color="var(--teal)" />
              <StatCard label="Completed Training"       value={completedTraining} color="var(--teal)" />
              <StatCard label="Pending Reviews"          value={pendingReviews}    color="var(--purple)" />
              <StatCard label="Completed Reviews"        value={completedReviews}  color="var(--purple)"
                sub={`${pct(completedReviews, perfReviews.length)}% complete rate`}
              />
            </div>
          </div>
        )}

        {/* PROTECT Module metrics */}
        {flags.protect !== false && absences.length + empDocs.length > 0 && (
          <div className="card p-6 mt-6">
            <SectionHeader icon={ShieldCheck} title="PROTECT — HR Risk & Compliance" color="var(--blue)" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Pending Absence Requests"  value={pendingAbsences}  color="var(--blue)" />
              <StatCard label="Approved Absences"         value={approvedAbsences} color="var(--teal)" />
              <StatCard label="Expired Employee Docs"     value={expiredEmpDocs}   color="var(--red)"
                sub={expiredEmpDocs > 0 ? 'Requires action' : 'None expired'}
              />
              <StatCard label="Expiring within 30 days"  value={expiringEmpDocs}  color="#D97706"
                sub={expiringEmpDocs > 0 ? 'Review soon' : 'All current'}
              />
            </div>
          </div>
        )}

      </main>
  );
}
