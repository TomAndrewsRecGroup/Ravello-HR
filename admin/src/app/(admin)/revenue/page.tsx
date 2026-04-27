import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Gift,
  CreditCard, Clock, ChevronRight,
} from 'lucide-react';
import { hasPaidFlag } from '@/lib/featureFlags';

export const metadata: Metadata = { title: 'Revenue' };
export const dynamic    = 'force-dynamic';
// Live data — billing state changes via webhooks. Don't cache.

// ─────────────────────────────────────────────────────────────────
// Stripe-backed MRR / billing dashboard.
//
// Source of truth for revenue:
//   • companies.monthly_retainer_pence  — the agreed retainer
//   • companies.subscription_status     — Stripe sub state, kept in
//                                          sync by /api/stripe/webhook
//   • stripe_events                     — audit trail (last N rendered
//                                          on the page)
//
// Everything counts pence and converts to £ for display only — keeps
// rounding clean and matches Stripe's internal representation.
// ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active:             'Active',
  trialing:           'Trialing',
  past_due:           'Past due',
  unpaid:             'Unpaid',
  incomplete:         'Awaiting payment',
  incomplete_expired: 'Setup expired',
  canceled:           'Cancelled',
  paused:             'Paused',
};

// "Earning" = MRR counts toward active revenue. "At risk" = sub exists
// but isn't paying us this period. Anything else (cancelled etc.) is
// off the books.
const EARNING_STATUSES  = new Set(['active', 'trialing']);
const AT_RISK_STATUSES  = new Set(['past_due', 'unpaid', 'incomplete']);

function statusTone(s: string | null): { bg: string; fg: string } {
  if (!s)                              return { bg: 'rgba(7,11,29,0.06)',    fg: 'var(--ink-soft)' };
  if (EARNING_STATUSES.has(s))         return { bg: 'rgba(20,184,166,0.10)', fg: 'var(--teal)'     };
  if (AT_RISK_STATUSES.has(s))         return { bg: 'rgba(245,158,11,0.12)', fg: 'var(--amber)'    };
  if (s === 'canceled' || s === 'incomplete_expired')
                                       return { bg: 'rgba(217,68,68,0.08)',  fg: 'var(--red)'      };
  return                                       { bg: 'rgba(7,11,29,0.06)',   fg: 'var(--ink-soft)' };
}

function pence(p: number | null | undefined): string {
  return new Intl.NumberFormat('en-GB', {
    style:                 'currency',
    currency:              'GBP',
    maximumFractionDigits: 0,
  }).format((p ?? 0) / 100);
}

function pence2dp(p: number | null | undefined): string {
  return new Intl.NumberFormat('en-GB', {
    style:                 'currency',
    currency:              'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((p ?? 0) / 100);
}

const EVENT_LABEL: Record<string, string> = {
  'invoice.paid':                  'Payment received',
  'invoice.payment_failed':        'Payment failed',
  'customer.subscription.created': 'Subscription created',
  'customer.subscription.updated': 'Subscription updated',
  'customer.subscription.deleted': 'Subscription cancelled',
};

const EVENT_TONE: Record<string, 'good' | 'bad' | 'neutral'> = {
  'invoice.paid':                  'good',
  'invoice.payment_failed':        'bad',
  'customer.subscription.created': 'good',
  'customer.subscription.updated': 'neutral',
  'customer.subscription.deleted': 'bad',
};

export default async function RevenuePage() {
  const supabase = createServerSupabaseClient();

  // Single round trip: every signal we need for the page.
  const [companiesRes, eventsRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, active, monthly_retainer_pence, subscription_status, stripe_subscription_id, subscription_started_at, feature_flags')
      .order('monthly_retainer_pence', { ascending: false, nullsFirst: false }),
    supabase
      .from('stripe_events')
      .select('id, type, handled_at, company_id, companies(name)')
      .order('handled_at', { ascending: false })
      .limit(20),
  ]);

  const companies = companiesRes.data ?? [];
  const events    = eventsRes.data    ?? [];

  // ── Aggregate metrics ─────────────────────────────────────────
  let mrrPence            = 0;   // active + trialing
  let atRiskPence         = 0;   // past_due / unpaid / incomplete
  let activeSubs          = 0;
  let atRiskSubs          = 0;
  let freeClients         = 0;   // has any flag, no Stripe sub
  let unbilledPaidClients = 0;   // paid flag enabled, no retainer set yet
  const statusCounts: Record<string, number> = {};

  for (const c of companies) {
    if (!c.active) continue;
    const flags  = (c as any).feature_flags ?? {};
    const status = c.subscription_status as string | null;
    const cents  = c.monthly_retainer_pence ?? 0;

    if (status) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      if (EARNING_STATUSES.has(status))  { mrrPence    += cents; activeSubs++; }
      if (AT_RISK_STATUSES.has(status))  { atRiskPence += cents; atRiskSubs++; }
    } else {
      // No subscription — either a free client or a paid client we
      // haven't billed yet. Distinguish by whether any paid flag is on.
      if (hasPaidFlag(flags)) unbilledPaidClients++;
      else                    freeClients++;
    }
  }

  const arrPence    = mrrPence * 12;
  const avgMrrPence = activeSubs > 0 ? Math.round(mrrPence / activeSubs) : 0;

  // Per-client revenue rows, sorted by MRR descending. Keeps cancelled
  // and free clients in the table too (with appropriate badges) so admin
  // can see the full roster at a glance.
  const rows = companies
    .filter(c => c.active)
    .map(c => {
      const status = c.subscription_status as string | null;
      const cents  = c.monthly_retainer_pence ?? 0;
      return {
        id:         c.id,
        name:       c.name,
        retainer:   cents,
        status,
        startedAt:  c.subscription_started_at as string | null,
        isFree:     !status && !hasPaidFlag((c as any).feature_flags ?? {}),
        unbilled:   !status && hasPaidFlag((c as any).feature_flags ?? {}),
        share:      mrrPence > 0 && status && EARNING_STATUSES.has(status)
                      ? Math.round((cents / mrrPence) * 100)
                      : 0,
      };
    });

  return (
    <>
      <AdminTopbar
        title="Revenue"
        subtitle="MRR, billing status and recent activity"
      />

      <main className="admin-page flex-1 space-y-6">

        {/* ── Headline metrics ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="MRR"
            sublabel={`${activeSubs} active sub${activeSubs !== 1 ? 's' : ''}`}
            value={pence(mrrPence)}
            tone="purple"
            icon={TrendingUp}
          />
          <StatCard
            label="Annual run rate"
            sublabel="MRR × 12"
            value={pence(arrPence)}
            tone="ink"
            icon={CreditCard}
          />
          <StatCard
            label="At-risk MRR"
            sublabel={`${atRiskSubs} sub${atRiskSubs !== 1 ? 's' : ''} not paying`}
            value={pence(atRiskPence)}
            tone={atRiskPence > 0 ? 'amber' : 'ink-faint'}
            icon={AlertTriangle}
          />
          <StatCard
            label="Avg per active sub"
            sublabel={activeSubs > 0 ? 'this month' : 'no active subs'}
            value={pence(avgMrrPence)}
            tone="teal"
            icon={CheckCircle2}
          />
        </div>

        {/* ── Two-column layout: status mix + free/unbilled callouts ── */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          {/* Subscription status breakdown */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold" style={{ color: 'var(--ink)' }}>Subscription status mix</h3>
              <Link href="/clients" prefetch={false} className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{ color: 'var(--purple)' }}>
                See all clients <ChevronRight size={11} />
              </Link>
            </div>
            {Object.keys(statusCounts).length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-faint)' }}>
                No subscriptions yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(statusCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const tone  = statusTone(status);
                    const total = companies.filter(c => c.active).length;
                    const pct   = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium" style={{ color: tone.fg }}>
                            {STATUS_LABEL[status] ?? status}
                          </span>
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-soft)' }}>
                            {count} {count === 1 ? 'client' : 'clients'}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full" style={{ width: `${pct}%`, background: tone.fg }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Side callouts: free clients + unbilled paid */}
          <div className="space-y-4">
            <CalloutCard
              icon={Gift}
              tone="teal"
              label="Free clients"
              count={freeClients}
              hint="On free programmes only — no Stripe sub, no retainer."
            />
            <CalloutCard
              icon={AlertTriangle}
              tone={unbilledPaidClients > 0 ? 'amber' : 'ink-faint'}
              label="Paid but unbilled"
              count={unbilledPaidClients}
              hint={unbilledPaidClients > 0
                ? 'Have paid modules enabled but no retainer set. Review and bill.'
                : 'Every paid client has billing configured.'}
            />
          </div>
        </div>

        {/* ── Per-client revenue table ──────────────────────────── */}
        <div className="card p-6">
          <h3 className="font-display text-sm font-semibold mb-4" style={{ color: 'var(--ink)' }}>Revenue by client</h3>
          {rows.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-faint)' }}>
              No active clients yet.
            </p>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th className="text-right">MRR</th>
                    <th>Share of total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const tone = statusTone(r.status);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link prefetch={false} href={`/clients/${r.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--ink)' }}>
                            {r.name}
                          </Link>
                        </td>
                        <td>
                          {r.isFree ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
                              Free tier
                            </span>
                          ) : r.unbilled ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}>
                              Unbilled
                            </span>
                          ) : r.status ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: tone.bg, color: tone.fg }}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>—</span>
                          )}
                        </td>
                        <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          {r.startedAt
                            ? new Date(r.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="text-right text-sm font-semibold" style={{ color: r.retainer > 0 ? 'var(--ink)' : 'var(--ink-faint)' }}>
                          {r.retainer > 0 ? pence2dp(r.retainer) : '—'}
                        </td>
                        <td>
                          {r.share > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                                <div className="h-full" style={{ width: `${r.share}%`, background: 'var(--gradient)' }} />
                              </div>
                              <span className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>{r.share}%</span>
                            </div>
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Recent billing events ─────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recent billing events</h3>
            <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>From Stripe webhooks</span>
          </div>
          {events.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--ink-faint)' }}>
              No billing events recorded yet. Stripe webhook events will appear here as they arrive.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {events.map((e: any) => {
                const label = EVENT_LABEL[e.type] ?? e.type;
                const tone  = EVENT_TONE[e.type]  ?? 'neutral';
                const colour = tone === 'good' ? 'var(--teal)'
                             : tone === 'bad'  ? 'var(--red)'
                             :                   'var(--ink-soft)';
                return (
                  <div key={e.id} className="flex items-center gap-3 py-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: tone === 'good' ? 'rgba(20,184,166,0.10)' : tone === 'bad' ? 'rgba(217,68,68,0.08)' : 'var(--surface-soft)' }}
                    >
                      <Clock size={12} style={{ color: colour }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {label}
                        {e.companies?.name && (
                          <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>
                            {' · '}{e.companies.name}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        {new Date(e.handled_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {e.company_id && (
                      <Link
                        prefetch={false}
                        href={`/clients/${e.company_id}`}
                        className="text-[11px] font-semibold flex items-center gap-1 hover:underline flex-shrink-0"
                        style={{ color: 'var(--purple)' }}
                      >
                        Open <ChevronRight size={11} />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:    string;
  sublabel: string;
  value:    string;
  tone:     'purple' | 'teal' | 'amber' | 'ink' | 'ink-faint';
  icon:     typeof TrendingUp;
}
function StatCard({ label, sublabel, value, tone, icon: Icon }: StatCardProps) {
  const colour = tone === 'purple'    ? 'var(--purple)'
              : tone === 'teal'      ? 'var(--teal)'
              : tone === 'amber'     ? 'var(--amber)'
              : tone === 'ink-faint' ? 'var(--ink-faint)'
              :                        'var(--ink)';
  const bg     = tone === 'purple'    ? 'rgba(124,58,237,0.08)'
              : tone === 'teal'      ? 'rgba(20,184,166,0.10)'
              : tone === 'amber'     ? 'rgba(245,158,11,0.12)'
              :                        'var(--surface-soft)';
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: bg, color: colour }}>
          <Icon size={13} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>{label}</p>
      </div>
      <p className="font-display font-bold text-2xl" style={{ color: colour }}>{value}</p>
      <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{sublabel}</p>
    </div>
  );
}

interface CalloutProps {
  icon:  typeof TrendingUp;
  tone:  'teal' | 'amber' | 'ink-faint';
  label: string;
  count: number;
  hint:  string;
}
function CalloutCard({ icon: Icon, tone, label, count, hint }: CalloutProps) {
  const colour = tone === 'teal'      ? 'var(--teal)'
              : tone === 'amber'     ? 'var(--amber)'
              :                        'var(--ink-faint)';
  const bg     = tone === 'teal'      ? 'rgba(20,184,166,0.06)'
              : tone === 'amber'     ? 'rgba(245,158,11,0.06)'
              :                        'var(--surface-soft)';
  const border = tone === 'teal'      ? 'rgba(20,184,166,0.18)'
              : tone === 'amber'     ? 'rgba(245,158,11,0.20)'
              :                        'var(--line)';
  return (
    <div className="rounded-[12px] p-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} style={{ color: colour }} />
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colour }}>{label}</p>
      </div>
      <p className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--ink)' }}>{count}</p>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--ink-soft)' }}>{hint}</p>
    </div>
  );
}
