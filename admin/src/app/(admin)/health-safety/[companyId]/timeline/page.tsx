import type { Metadata } from 'next';
import Link from 'next/link';
import { History } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HS_ENTITY_LABELS } from '@/lib/hs/vocab';
import type { HsEvent } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Safety Timeline' };
export const dynamic = 'force-dynamic';

const PAGE = 50;

// The Safety Timeline: every H&S event for this client, newest first.
// Written only by database triggers (095) and never editable, so it is
// the same record the client sees.
export default async function HealthSafetyTimelinePage({
  params, searchParams,
}: { params: { companyId: string }; searchParams: { page?: string } }) {
  const supabase = createServerSupabaseClient();

  const page = Math.max(0, Math.min(1000, Number.parseInt(searchParams.page ?? '0', 10) || 0));
  const { data, error, count } = await supabase
    .from('hs_events')
    .select('id, occurred_at, entity_type, entity_id, event_type, summary, actor_kind', { count: 'exact' })
    .eq('company_id', params.companyId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  const events = (data ?? []) as HsEvent[];
  const total = count ?? 0;
  const base = `/health-safety/${params.companyId}/timeline`;

  return (
    <div className="space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the timeline: {error.message}</p>}
      {events.length === 0 ? (
        <div className="card empty-state p-10">
          <History size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing on the timeline yet.</p>
        </div>
      ) : (
        <ol className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {events.map(ev => (
            <li key={ev.id} className="flex gap-4 p-4 text-sm">
              <time className="w-28 shrink-0" style={{ color: 'var(--ink-faint)' }} dateTime={ev.occurred_at}>
                {new Date(ev.occurred_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
              </time>
              <span className="flex-1" style={{ color: 'var(--ink)' }}>{ev.summary}</span>
              <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
                {HS_ENTITY_LABELS[ev.entity_type] ?? ev.entity_type} · {ev.actor_kind}
              </span>
            </li>
          ))}
        </ol>
      )}
      {total > PAGE && (
        <nav className="flex items-center justify-between text-sm" aria-label="Timeline pages">
          {page > 0
            ? <Link className="btn-secondary btn-sm" href={`${base}?page=${page - 1}`}>Newer</Link>
            : <span />}
          <span style={{ color: 'var(--ink-faint)' }}>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
          {(page + 1) * PAGE < total
            ? <Link className="btn-secondary btn-sm" href={`${base}?page=${page + 1}`}>Older</Link>
            : <span />}
        </nav>
      )}
    </div>
  );
}
