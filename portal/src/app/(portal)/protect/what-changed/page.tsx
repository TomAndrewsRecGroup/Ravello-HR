import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';
import { readAllPages } from '@/lib/supabase/paged';
import { computeWhatChanged, type PlatformEventRow } from '@/lib/whatChanged/compute';
import { filterClientVisible } from '@/lib/whatChanged/clientScope';

export const metadata: Metadata = { title: 'What Changed' };
export const dynamic = 'force-dynamic';

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function yesterday(): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return toISODate(d); }
function shiftDay(day: string, delta: number): string { const d = new Date(`${day}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + delta); return toISODate(d); }
function fmtDay(day: string): string { return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

// Core-OS 360 Completion Programme, Phase 25, Group 4 (closes gap-ledger
// row C9.4 — "client-facing, safely-scoped version for their own
// organisation"). Mirrors admin's own WhatChangedTab (Phase 9) — the
// identical pure computeWhatChanged() and the same "yesterday by
// default" reasoning (today is still in progress) — but shaped for a
// client rather than copied wholesale:
//
//   - platform_events is staff-only RLS (verified live before writing
//     this: the only policies are platform_events_staff_read —
//     is_tps_staff() only — and the write-guard restrictive policies;
//     no client SELECT policy exists), so this reads through the
//     SERVICE ROLE.
//   - The scope is a LIVE company lookup under the caller's own
//     session (effectiveCompanyId(), never a signed cookie) — this is
//     what makes the service-role read safe: the route derives WHO to
//     scope to from a fresh RPC call, not from anything the request
//     could influence, and it correctly resolves the ACTIVE
//     organisation for a portfolio consultant switched into this
//     client, the same as every other page in this app (Phase 1's own
//     "profiles.company_id is the HOME company and is wrong for a
//     consultant" rule).
//   - Plain Link-based day navigation, no client JS needed — the
//     IncidentPatternsView precedent (Phase 10/25). Admin's tab is a
//     client-side fetch because it has to re-fetch inside an
//     already-mounted, lazily-loaded tab; this is a standalone page
//     with no such constraint, so a server component + searchParams is
//     simpler and one fewer request round trip.
//   - filterClientVisible() (lib/whatChanged/clientScope.ts) drops
//     entity types that are staff-internal even when scoped to this
//     real company_id (internal_tasks, companies, enquiries,
//     bd_companies, referral_scan_runs, a draft board_assurance_reports)
//     — see that file's own header for why each one is excluded.
export default async function WhatChangedPage(props: { searchParams: Promise<{ day?: string }> }) {
  const searchParams = await props.searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? '') ? searchParams.day! : yesterday();
  const isToday = day === toISODate(new Date());

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const companyId = user ? await effectiveCompanyId(supabase) : null;

  if (!user || !companyId) {
    return (
      <main className="portal-page flex-1">
        <div className="card empty-state p-10">
          <Activity size={24} style={{ color: 'var(--ink-faint)' }} />
          <p style={{ color: 'var(--ink-faint)' }}>Could not determine your organisation.</p>
        </div>
      </main>
    );
  }

  const service = createServiceSupabaseClient();
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${shiftDay(day, 1)}T00:00:00.000Z`;
  const result = await readAllPages<PlatformEventRow>((from, to) =>
    service.from('platform_events').select('entity_type, event_type, actor_kind')
      .eq('company_id', companyId).gte('occurred_at', dayStart).lt('occurred_at', dayEnd)
      .order('id').range(from, to));

  const visible = filterClientVisible(result.rows);
  const summary = result.error ? null : computeWhatChanged(visible, day);

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/protect/what-changed?day=${shiftDay(day, -1)}`} className="btn-icon btn-sm" aria-label="Previous day">
          <ChevronLeft size={14} />
        </Link>
        <span className="text-sm font-semibold min-w-[220px] text-center" style={{ color: 'var(--ink)' }}>{fmtDay(day)}</span>
        {isToday
          ? <span className="btn-icon btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}><ChevronRight size={14} /></span>
          : <Link href={`/protect/what-changed?day=${shiftDay(day, 1)}`} className="btn-icon btn-sm" aria-label="Next day"><ChevronRight size={14} /></Link>}
        <Link href="/protect/what-changed" className="btn-ghost btn-sm ml-auto">Yesterday</Link>
      </div>

      {result.error && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load this day&apos;s activity: {result.error}</p>}

      {!result.error && summary && (
        summary.totalEvents === 0 ? (
          <div className="card empty-state p-10">
            <Activity size={24} style={{ color: 'var(--ink-faint)' }} />
            <p style={{ color: 'var(--ink-faint)' }}>Nothing changed for your organisation on this day.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="card p-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
              <span><strong style={{ color: 'var(--ink)' }}>{summary.totalEvents}</strong> change{summary.totalEvents === 1 ? '' : 's'}</span>
              <span>{summary.humanActorCount} by people, {summary.systemActorCount} automated</span>
              {result.truncated && <span style={{ color: 'var(--gold)' }}>Showing the first 200,000 — an unusually high-volume day.</span>}
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Record type</th><th>Created</th><th>Updated</th><th>Deleted</th><th>Reminders</th><th>Total</th></tr></thead>
                <tbody>
                  {summary.categories.map(c => (
                    <tr key={c.entityType}>
                      <td className="font-medium">{c.label}</td>
                      <td style={{ color: c.created > 0 ? 'var(--teal)' : 'var(--ink-faint)' }}>{c.created || '—'}</td>
                      <td style={{ color: c.updated > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>{c.updated || '—'}</td>
                      <td style={{ color: c.deleted > 0 ? 'var(--red)' : 'var(--ink-faint)' }}>{c.deleted || '—'}</td>
                      <td style={{ color: c.reminders > 0 ? 'var(--blue)' : 'var(--ink-faint)' }}>{c.reminders || '—'}</td>
                      <td className="font-semibold">{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </main>
  );
}
