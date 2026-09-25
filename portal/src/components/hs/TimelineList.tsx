import { HS_ENTITY_LABELS } from '@/lib/hs/vocab';
import type { HsEvent } from '@/lib/hs/types';

// The Safety Timeline as a client reads it. Events are written only by
// the database (095) and never edited, so this is the record itself,
// not a summary of it.
const ACTOR: Record<string, string> = {
  staff:    'Core OS 360',
  provider: 'Your H&S provider',
  client:   'Your team',
  system:   'System',
};

export default function TimelineList({ events }: { events: HsEvent[] }) {
  return (
    <ol className="divide-y" style={{ borderColor: 'var(--line)' }}>
      {events.map(ev => (
        <li key={ev.id} className="flex flex-col sm:flex-row gap-1 sm:gap-4 py-3 text-sm">
          <time className="sm:w-36 shrink-0" style={{ color: 'var(--ink-faint)' }} dateTime={ev.occurred_at}>
            {new Date(ev.occurred_at).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
            })}
          </time>
          <span className="flex-1" style={{ color: 'var(--ink)' }}>{ev.summary}</span>
          <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {HS_ENTITY_LABELS[ev.entity_type] ?? ev.entity_type} · {ACTOR[ev.actor_kind] ?? ev.actor_kind}
          </span>
        </li>
      ))}
    </ol>
  );
}
