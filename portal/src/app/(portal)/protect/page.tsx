import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, History } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { ragFor } from '@/lib/hs/recurrence';
import type { HsEvent } from '@/lib/hs/types';
import TimelineList from '@/components/hs/TimelineList';

export const metadata: Metadata = { title: 'Health & Safety' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// The Health & Safety overview: where the register stands, and what
// happened most recently. Core OS 360 staff deliver H&S directly
// (2026-09-25 — there is no outside provider). Everything is read with
// the client's own session, so RLS (095) scopes every row to their
// company.
export default async function ProtectOverviewPage() {
  const supabase = createServerSupabaseClient();
  const { companyId, accountManagerName, accountManagerEmail } = await getSessionProfile();

  const [register, { data: events, error: eventsErr }, { data: failedActions }] = await Promise.all([
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
      .eq('status', 'active')
      .in('action_type', ['hs_failed_check', 'hs_actions_raised', 'hs_followup'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
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
