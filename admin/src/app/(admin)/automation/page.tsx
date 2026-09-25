import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

  const [runs, pending, failed, recentEvents] = await Promise.all([
    supabase.from('automation_runs').select('id, job, started_at, finished_at, outcome, tally, error')
      .order('started_at', { ascending: false }).limit(30),
    supabase.from('platform_events').select('id', { count: 'exact', head: true }).is('processed_at', null),
    supabase.from('platform_events').select('id, occurred_at, company_id, entity_type, entity_id, event_type, attempts, last_error, actor_kind')
      .or(failedFilter).order('id', { ascending: false }).limit(50),
    supabase.from('platform_events').select('id, occurred_at, entity_type, event_type, actor_kind, processed_at, company_id')
      .order('id', { ascending: false }).limit(40),
  ]);

  return (
    <>
      <AdminTopbar title="Automation" subtitle="Event processing, reminders and the daily digest" />
      <main className="admin-page flex-1">
        <AutomationClient
          runs={(runs.data ?? []) as never}
          pendingCount={pending.count ?? 0}
          failed={(failed.data ?? []) as never}
          recent={(recentEvents.data ?? []) as never}
          loadError={runs.error?.message ?? failed.error?.message ?? null}
        />
      </main>
    </>
  );
}
