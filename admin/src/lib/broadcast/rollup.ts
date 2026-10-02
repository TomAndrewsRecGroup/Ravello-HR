// Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7): groups
// the raised-actions rows shown on the Broadcast page's own "Recent
// broadcasts" list back into the sends that created them, and — for a
// send that carries a regulatory origin (migration 194) — rolls up how
// many of its actions have reached completion. Pure, so the grouping/
// completion logic is testable without a Supabase client, the same
// "pure computation extracted from a server component" shape this
// codebase already uses throughout.

export interface BroadcastActionRow {
  id:           string;
  title:        string;
  description:  string | null;
  action_type:  string;
  priority:     string;
  due_date:     string | null;
  created_at:   string;
  company_id:   string;
  status:       string;
  source_type:  string | null;
  source_id:    string | null;
  companies:    { id: string; slug: string | null; name: string } | { id: string; slug: string | null; name: string }[] | null;
}

export interface BroadcastCompany { id: string; slug: string | null; name: string }

export interface BroadcastBucket {
  key:          string;
  title:        string;
  description:  string | null;
  action_type:  string;
  priority:     string;
  due_date:     string | null;
  created_at:   string;
  companies:    BroadcastCompany[];
  total:        number;
  complete:     number;
  /** How many of this bucket's recipients have acknowledged it (206) —
   *  a distinct fact from `complete`: acknowledging a message is not
   *  the same as completing the task it may also raise. */
  acknowledged: number;
  /** True when this bucket was raised from a legal requirement or
   *  regulatory-update prefill (source_type 'regulatory_broadcast') —
   *  an ordinary hand-typed broadcast is false. */
  regulatory:   boolean;
}

/** Round to the nearest second — broadcasts insert in a tight loop.
 *  Only used as a FALLBACK key for rows with no source_id (an ordinary
 *  hand-typed broadcast, or one sent before migration 194). */
function fallbackKey(a: BroadcastActionRow): string {
  const ts = new Date(a.created_at);
  ts.setMilliseconds(0);
  return `t:${a.title}|${a.description ?? ''}|${ts.toISOString()}`;
}

/**
 * @param acknowledgedActionIds action ids (206's broadcast_acknowledgements,
 *   distinct action_id values) with at least one recipient acknowledgement —
 *   supplied as plain input, the same "pure grouping, data handed in" shape
 *   `complete` already uses for `status`, never fetched inside this file.
 */
export function groupBroadcastActions(
  actions: BroadcastActionRow[],
  acknowledgedActionIds?: ReadonlySet<string>,
): BroadcastBucket[] {
  const byKey = new Map<string, BroadcastBucket>();
  for (const a of actions) {
    // source_id exactly identifies ONE send (broadcast_sends.id) —
    // preferred over the heuristic whenever it's present, since it can
    // never collide the way two coincidentally-identical hand-typed
    // broadcasts sent the same second theoretically could.
    const key = a.source_id ? `s:${a.source_id}` : fallbackKey(a);
    let b = byKey.get(key);
    if (!b) {
      b = {
        key, title: a.title, description: a.description, action_type: a.action_type, priority: a.priority,
        due_date: a.due_date, created_at: a.created_at, companies: [], total: 0, complete: 0, acknowledged: 0,
        regulatory: a.source_type === 'regulatory_broadcast',
      };
      byKey.set(key, b);
    }
    const c = Array.isArray(a.companies) ? a.companies[0] : a.companies;
    if (c) b.companies.push(c);
    b.total++;
    if (a.status === 'complete') b.complete++;
    if (acknowledgedActionIds?.has(a.id)) b.acknowledged++;
  }
  return [...byKey.values()];
}
