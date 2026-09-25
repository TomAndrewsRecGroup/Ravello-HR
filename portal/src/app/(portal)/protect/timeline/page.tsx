import type { Metadata } from 'next';
import Link from 'next/link';
import { History } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import type { HsEvent } from '@/lib/hs/types';
import TimelineList from '@/components/hs/TimelineList';

export const metadata: Metadata = { title: 'Safety Timeline' };
export const dynamic = 'force-dynamic';

const PAGE = 50;

// Every Health & Safety event on this client's record, newest first:
// register items added and completed, visits, drills, evidence, and who
// was given or lost access. Written only by database triggers (095), so
// nobody, Core OS 360 included, can edit or remove an entry.
export default async function SafetyTimelinePage({ searchParams }: { searchParams: { page?: string } }) {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const page = Math.max(0, Math.min(1000, Number.parseInt(searchParams.page ?? '0', 10) || 0));

  const { data, error, count } = await supabase
    .from('hs_events')
    .select('id, occurred_at, entity_type, entity_id, event_type, summary, actor_kind', { count: 'exact' })
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  const events = (data ?? []) as HsEvent[];
  const total = count ?? 0;

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>The timeline could not be loaded. Refresh to try again.</p>}
      {events.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <History size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Nothing on your Safety Timeline yet</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
              Visits, checks, certificates and changes to who can see your data appear here as they happen.
            </p>
          </div>
        </div>
      ) : (
        <section className="card px-5 py-2">
          <TimelineList events={events} />
        </section>
      )}
      {total > PAGE && (
        <nav className="flex items-center justify-between text-sm" aria-label="Timeline pages">
          {page > 0 ? <Link className="btn-secondary btn-sm" href={`/protect/timeline?page=${page - 1}`}>Newer</Link> : <span />}
          <span style={{ color: 'var(--ink-faint)' }}>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
          {(page + 1) * PAGE < total ? <Link className="btn-secondary btn-sm" href={`/protect/timeline?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
