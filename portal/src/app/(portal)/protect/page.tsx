import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, History } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { ragFor } from '@/lib/hs/recurrence';
import type { HsEvent } from '@/lib/hs/types';
import TimelineList from '@/components/hs/TimelineList';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';
import { orgSitesAndDepartments, param, fmtDate } from '@/lib/hs/safetyContext';
import FilterForm from '@/components/safety/FilterForm';

export const metadata: Metadata = { title: 'Health & Safety' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// The Health & Safety overview: where the register stands, and what
// happened most recently. Core OS 360 staff deliver H&S directly
// (2026-09-25 — there is no outside provider). Everything is read with
// the client's own session, so RLS (095) scopes every row to their
// company.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

// Safety at a glance (spec §3): factual counts only, from
// hs_safety_overview() (128) — SECURITY INVOKER, so every figure is
// what the viewer's own RLS lets them see, for the ONE organisation
// they are acting in. A consultant changes client with the organisation
// switcher; nothing here totals across clients.
type Overview = Record<string, number | string>;

export default async function ProtectOverviewPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabaseClient();
  const { accountManagerName, accountManagerEmail } = await getSessionProfile();
  const companyId = await effectiveCompanyId(supabase);
  const f = { site: param(sp, 'site'), department: param(sp, 'department'), from: param(sp, 'from'), to: param(sp, 'to') };

  const [register, { data: events, error: eventsErr }, { data: failedActions }, overviewRes, places] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string; due_date: string | null }>((from, to) =>
      supabase.from('compliance_items')
        .select('id, title, status, due_date')
        .eq('company_id', companyId)
        .eq('domain', 'hs')
        .order('due_date', { ascending: true, nullsFirst: false }).order('id')
        .range(from, to)),
    supabase.from('hs_events')
      .select('id, occurred_at, entity_type, entity_id, event_type, summary, actor_kind')
      .eq('company_id', companyId)
      .order('occurred_at', { ascending: false }).order('id', { ascending: false })
      .limit(8),
    // Actions the platform raised from a failed or actions-raised check
    // (lib/events/hsRules.ts). Still active = still waiting on the client.
    supabase.from('actions')
      .select('id, title, priority, action_type, created_at')
      .eq('company_id', companyId)
      .in('status', ['active', 'in_progress', 'awaiting_verification'])
      .in('action_type', ['hs_failed_check', 'hs_actions_raised', 'hs_followup'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.rpc('hs_safety_overview', {
      p_site: UUID.test(f.site) ? f.site : null, p_department: UUID.test(f.department) ? f.department : null,
      p_from: ISO.test(f.from) ? f.from : null, p_to: ISO.test(f.to) ? f.to : null,
    }),
    companyId ? orgSitesAndDepartments(supabase, companyId) : Promise.resolve({ sites: [], departments: [] }),
  ]);
  const ov = (overviewRes.data ?? {}) as Overview;
  const n = (k: string) => Number(ov[k] ?? 0);
  const period = `${fmtDate(String(ov.period_from ?? ''))} – ${fmtDate(String(ov.period_to ?? ''))}`;
  const GLANCE = [
    { label: 'Open hazards',                 value: n('open_hazards'),          href: '/protect/hazards',          alert: false, note: n('unassessed_hazards') ? `${n('unassessed_hazards')} not yet assessed` : null },
    { label: 'High / very high residual risk', value: n('high_residual_risks'), href: '/protect/analysis',         alert: n('high_residual_risks') > 0, note: null },
    { label: 'Risk assessments needing review', value: n('ra_review_required'), href: '/protect/risk-assessments', alert: n('ra_review_required') > 0, note: null },
    { label: 'Active RAMS',                  value: n('active_rams'),           href: '/protect/rams',             alert: false, note: null },
    { label: 'COSHH needing review',         value: n('coshh_review_required'), href: '/protect/coshh',            alert: n('coshh_review_required') > 0, note: null },
    { label: 'Incidents',                    value: n('incidents_in_period'),   href: '/protect/incidents',        alert: false, note: period },
    { label: 'Near misses',                  value: n('near_misses_in_period'), href: '/protect/incidents',        alert: false, note: period },
    { label: 'Investigations open',          value: n('investigations_open'),   href: '/protect/investigations',   alert: false, note: null },
    { label: 'Overdue corrective actions',   value: n('overdue_actions'),       href: '/protect/actions',          alert: n('overdue_actions') > 0, note: n('awaiting_verification') ? `${n('awaiting_verification')} awaiting verification` : null },
    { label: 'RIDDOR review required',       value: n('riddor_review_required'), href: '/protect/incidents',       alert: n('riddor_review_required') > 0, note: null },
  ];
  const awaiting = (failedActions ?? []) as { id: string; title: string; priority: string; action_type: string; created_at: string }[];

  const items = register.rows;
  const counts = { red: 0, amber: 0, green: 0, complete: 0 };
  for (const i of items) {
    const r = ragFor(i.status, i.due_date);
    if (r !== 'none') counts[r]++;
  }
  const nextDue = items.filter(i => i.status !== 'complete' && i.due_date).slice(0, 5);

  const TILES = [
    { key: 'red',      label: 'Overdue',          value: counts.red,      colour: 'var(--danger)',  icon: AlertTriangle },
    { key: 'amber',    label: 'Due in 30 days',   value: counts.amber,    colour: 'var(--amber)',   icon: Clock },
    { key: 'green',    label: 'On track',         value: counts.green,    colour: 'var(--success)', icon: ShieldCheck },
    { key: 'complete', label: 'Complete',         value: counts.complete, colour: 'var(--ink-faint)', icon: CheckCircle2 },
  ] as const;

  return (
    <main className="portal-page flex-1 space-y-6">
      <section className="space-y-3" aria-label="Safety at a glance">
        <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>Safety at a glance</h2>
        <FilterForm action="/protect" fields={[
          { name: 'site', label: 'Site', value: f.site, options: places.sites.map(s => ({ value: s.id, label: s.name })) },
          { name: 'department', label: 'Department / area', value: f.department, options: places.departments.map(d => ({ value: d.id, label: d.name })) },
          { name: 'from', label: 'Incidents from', type: 'date', value: f.from },
          { name: 'to', label: 'to', type: 'date', value: f.to },
        ]} />
        {overviewRes.error && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>The safety figures could not be loaded. Refresh to try again.</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {GLANCE.map(t => (
            <Link key={t.label} href={t.href} className="card p-4 block">
              <p className="text-xs font-medium mb-1" style={{ color: t.alert ? 'var(--danger)' : 'var(--ink-soft)' }}>{t.label}</p>
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{t.value}</p>
              {t.note && <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{t.note}</p>}
            </Link>
          ))}
        </div>
      </section>

      <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>Your compliance register</h2>
      {(register.error || eventsErr) && (
        <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>
          Some of your Health &amp; Safety record could not be loaded. Refresh to try again.
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Register status">
        {TILES.map(t => (
          <Link key={t.key} href="/protect/compliance" className="card p-4 block">
            <p className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: t.colour }}>
              <t.icon size={13} aria-hidden /> {t.label}
            </p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{t.value}</p>
          </Link>
        ))}
      </section>

      {awaiting.length > 0 && (
        <section className="card p-5" style={{ borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }} aria-label="Checks awaiting action">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <AlertTriangle size={16} style={{ color: 'var(--danger)' }} /> Checks awaiting your action ({awaiting.length})
            </h2>
            <Link href="/protect/actions" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>Open actions →</Link>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {awaiting.map(a => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span style={{ color: 'var(--ink)' }}>{a.title}</span>
                <span className="text-xs shrink-0" style={{ color: a.priority === 'high' || a.priority === 'urgent' ? 'var(--danger)' : 'var(--ink-faint)' }}>
                  {a.action_type === 'hs_failed_check' ? 'Failed check' : a.action_type === 'hs_followup' ? 'Follow-up' : 'Actions raised'} · {fmt(a.created_at.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <History size={16} /> Latest on your Safety Timeline
            </h2>
            <Link href="/protect/timeline" className="text-xs font-medium" style={{ color: 'var(--purple)' }}>View all →</Link>
          </div>
          {(events ?? []).length === 0 ? (
            <p className="text-sm py-6" style={{ color: 'var(--ink-faint)' }}>
              Nothing recorded yet. Visits, checks and certificates appear here as they are logged.
            </p>
          ) : (
            <TimelineList events={(events ?? []) as HsEvent[]} />
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-display font-semibold mb-3" style={{ color: 'var(--ink)' }}>Coming up</h2>
            {nextDue.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing due on your register.</p>
            ) : (
              <ul className="space-y-2">
                {nextDue.map(i => {
                  const r = ragFor(i.status, i.due_date);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate" style={{ color: 'var(--ink)' }}>{i.title}</span>
                      <span className="shrink-0 text-xs font-medium" style={{ color: r === 'red' ? 'var(--danger)' : r === 'amber' ? 'var(--amber)' : 'var(--ink-faint)' }}>
                        {r === 'red' ? 'Overdue · ' : ''}{fmt(i.due_date!)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-display font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <ShieldCheck size={16} /> Who manages your H&amp;S
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your Health &amp; Safety is managed directly by Core OS 360 — the same team as your HR and Recruitment.
            </p>
            {(accountManagerName || accountManagerEmail) && (
              <p className="text-sm mt-2" style={{ color: 'var(--ink)' }}>
                Your account contact: <span className="font-medium">{accountManagerName ?? accountManagerEmail}</span>
                {accountManagerName && accountManagerEmail && (
                  <span style={{ color: 'var(--ink-faint)' }}> · {accountManagerEmail}</span>
                )}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
