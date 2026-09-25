import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import AutomationClient from './AutomationClient';

export const metadata: Metadata = { title: 'Automation' };
export const dynamic = 'force-dynamic';

// What the crons did, what is waiting, and what failed. Reads under the
// staff session (platform_events and automation_runs are staff-SELECT);
// the retry button goes through a service-role route.

export default async function AutomationPage() {
  const supabase = createServerSupabaseClient();
  const failedFilter = 'and(processed_at.is.null,or(attempts.gte.5,last_error.not.is.null))';

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [runs, pending, failed, recentEvents, jev] = await Promise.all([
    supabase.from('automation_runs').select('id, job, started_at, finished_at, outcome, tally, error')
      .order('started_at', { ascending: false }).limit(30),
    supabase.from('platform_events').select('id', { count: 'exact', head: true }).is('processed_at', null),
    supabase.from('platform_events').select('id, occurred_at, company_id, entity_type, entity_id, event_type, attempts, last_error, actor_kind')
      .or(failedFilter).order('id', { ascending: false }).limit(50),
    supabase.from('platform_events').select('id, occurred_at, entity_type, event_type, actor_kind, processed_at, company_id')
      .order('id', { ascending: false }).limit(40),
    readAllPages<{ kind: string; gated: boolean; acted: boolean; human_outcome: string | null; error: string | null; duration_ms: number | null; input_tokens: number | null }>((from, to) =>
      supabase.from('jev_decisions').select('kind, gated, acted, human_outcome, error, duration_ms, input_tokens')
        .gte('created_at', since).order('created_at', { ascending: false }).order('id').range(from, to)),
  ]);

  // Per-kind Jev summary for the last 30 days: volume, how often the
  // gate held it back, how often a person agreed. Agreement is the
  // number that says whether a suggestion is worth showing at all.
  const jevStats = new Map<string, { calls: number; errors: number; gated: number; acted: number; accepted: number; overridden: number; ignored: number; tokens: number; ms: number }>();
  for (const d of jev.rows) {
    const st = jevStats.get(d.kind) ?? { calls: 0, errors: 0, gated: 0, acted: 0, accepted: 0, overridden: 0, ignored: 0, tokens: 0, ms: 0 };
    st.calls++;
    if (d.error) st.errors++;
    if (d.gated) st.gated++;
    if (d.acted) st.acted++;
    if (d.human_outcome === 'accepted') st.accepted++;
    if (d.human_outcome === 'overridden') st.overridden++;
    if (d.human_outcome === 'ignored') st.ignored++;
    st.tokens += d.input_tokens ?? 0;
    st.ms += d.duration_ms ?? 0;
    jevStats.set(d.kind, st);
  }

  return (
    <>
      <AdminTopbar title="Automation" subtitle="Event processing, reminders and the daily digest" />
      <main className="admin-page flex-1">
        <AutomationClient
          runs={(runs.data ?? []) as never}
          pendingCount={pending.count ?? 0}
          failed={(failed.data ?? []) as never}
          recent={(recentEvents.data ?? []) as never}
          jev={[...jevStats.entries()].map(([kind, st]) => ({ kind, ...st }))}
          loadError={runs.error?.message ?? failed.error?.message ?? null}
        />
      </main>
    </>
  );
}
