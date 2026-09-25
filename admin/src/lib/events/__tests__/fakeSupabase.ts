// A stateful in-memory stand-in for the service-role client, shaped
// like PostgREST where it matters to these modules: filters narrow the
// affected rows, `count` reports how many matched, `upsert(...,
// { ignoreDuplicates })` returns ONLY the rows it inserted, and
// `claim_platform_events` behaves like the 096 function (unprocessed,
// under five attempts, lease expired, attempts incremented).

export type Row = Record<string, any>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  client: any;
  nextId: number;
  now: () => Date;
}

export function fakeSupabase(seed: Record<string, Row[]> = {}, opts: { now?: () => Date } = {}): FakeDb {
  const tables: Record<string, Row[]> = { ...seed };
  const db: FakeDb = { tables, client: null, nextId: 1000, now: opts.now ?? (() => new Date()) };
  const table = (name: string) => (tables[name] ??= []);

  const uniqueKeys: Record<string, string> = {
    notifications: 'dedupe_key', platform_events: 'dedupe_key', email_log: 'dedupe_key', notification_preferences: 'user_id',
  };

  function builder(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
    let payload: Row[] = [];
    let patch: Row = {};
    let wantCount = false;
    let head = false;
    let single: 'single' | 'maybe' | null = null;
    let limitN: number | null = null;
    let selectAfterWrite = false;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let order: { col: string; asc: boolean } | null = null;

    const q: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (op !== 'select') selectAfterWrite = true;
        if (o?.count) wantCount = true;
        if (o?.head) head = true;
        return q;
      },
      insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(rows: Row | Row[], o: typeof upsertOpts = {}) { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; upsertOpts = o; return q; },
      update(p: Row, o?: { count?: string }) { op = 'update'; patch = p; if (o?.count) wantCount = true; return q; },
      eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
      is(c: string, v: unknown) { filters.push(r => (v === null ? r[c] == null : r[c] === v)); return q; },
      in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q; },
      gte(c: string, v: any) { filters.push(r => r[c] >= v); return q; },
      lt(c: string, v: any) { filters.push(r => r[c] != null && r[c] < v); return q; },
      lte(c: string, v: any) { filters.push(r => r[c] != null && r[c] <= v); return q; },
      not(c: string, _op: string, v: unknown) { filters.push(r => !(v === null ? r[c] == null : r[c] === v)); return q; },
      or(_expr: string) { return q; },
      order(col: string, o?: { ascending?: boolean }) { order = { col, asc: o?.ascending !== false }; return q; },
      limit(n: number) { limitN = n; return q; },
      range(from: number, to: number) { limitN = to - from + 1; (q as any)._from = from; return q; },
      single() { single = 'single'; return q; },
      maybeSingle() { single = 'maybe'; return q; },
      then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
    };

    function matching(): Row[] {
      let rows = table(name).filter(r => filters.every(f => f(r)));
      if (order) rows = [...rows].sort((a, b) => (a[order!.col] > b[order!.col] ? 1 : a[order!.col] < b[order!.col] ? -1 : 0) * (order!.asc ? 1 : -1));
      const from = (q as any)._from ?? 0;
      if (limitN != null) rows = rows.slice(from, from + limitN);
      return rows;
    }

    function finish(rows: Row[]) {
      if (single === 'single') return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' }, count: null };
      if (single === 'maybe') return { data: rows[0] ?? null, error: null, count: null };
      return { data: head ? null : rows, error: null, count: wantCount ? rows.length : null };
    }

    function run() {
      if (op === 'select') return finish(matching());
      if (op === 'insert') {
        const inserted: Row[] = payload.map(r => ({ id: r.id ?? `${name}-${db.nextId++}`, ...r }));
        const key = uniqueKeys[name];
        if (key && inserted.some(r => r[key] != null && table(name).some(e => e[key] === r[key]))) {
          return { data: null, error: { message: `duplicate key value violates unique constraint (${name}.${key})` }, count: null };
        }
        table(name).push(...inserted);
        return { data: selectAfterWrite ? inserted : null, error: null, count: null };
      }
      if (op === 'upsert') {
        const key = upsertOpts.onConflict ?? uniqueKeys[name];
        // PostgREST returns every upserted row with merge-duplicates
        // (the default), and ONLY the inserted ones with ignoreDuplicates.
        // A caller that forgets ignoreDuplicates therefore sees a
        // duplicate as "created" — which is exactly the mistake the
        // process tests need to be able to catch.
        const returned: Row[] = [];
        for (const r of payload) {
          const existing = key ? table(name).find(e => r[key] != null && e[key] === r[key]) : undefined;
          if (existing) {
            if (!upsertOpts.ignoreDuplicates) { Object.assign(existing, r); returned.push(existing); }
            continue;
          }
          const row = { id: r.id ?? `${name}-${db.nextId++}`, ...r };
          table(name).push(row);
          returned.push(row);
        }
        return { data: selectAfterWrite ? returned : null, error: null, count: null };
      }
      // update
      const hit = matching();
      hit.forEach(r => Object.assign(r, patch));
      return { data: selectAfterWrite ? hit : null, error: null, count: wantCount ? hit.length : null };
    }
    return q;
  }

  db.client = {
    from: (name: string) => builder(name),
    rpc: async (fn: string, args: Row) => {
      if (fn !== 'claim_platform_events') return { data: null, error: { message: `unknown rpc ${fn}` } };
      const nowMs = db.now().getTime();
      const leaseSec = Number(String(args.p_lease).split(' ')[0]);
      const rows = table('platform_events')
        .filter(e => e.processed_at == null && (e.attempts ?? 0) < 5
          && (e.claimed_at == null || Date.parse(e.claimed_at) < nowMs - leaseSec * 1000))
        .sort((a, b) => a.id - b.id)
        .slice(0, args.p_limit);
      for (const e of rows) { e.claimed_at = new Date(nowMs).toISOString(); e.attempts = (e.attempts ?? 0) + 1; }
      return { data: rows.map(r => ({ ...r })), error: null };
    },
  };
  return db;
}

export function eventRow(over: Partial<Row> & { entity_type: string; event_type: string }): Row {
  return {
    id: over.id ?? Math.floor(Math.random() * 1e9),
    occurred_at: new Date().toISOString(),
    company_id: 'co-1', entity_id: 'ent-1', payload: {}, actor_id: null, actor_kind: 'system',
    dedupe_key: null, claimed_at: null, processed_at: null, attempts: 0, last_error: null,
    ...over,
  };
}
