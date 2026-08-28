import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentSupabase, resetQueryFaultSink, setQueryFaultSink, type QueryFault } from '../instrument';

// A stand-in for a supabase-js query builder: chainable, thenable, and
// resolving to the { data, error } shape rather than throwing — which
// is the whole reason failures here are invisible by default.
function fakeBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select() { return builder; },
    eq()     { return builder; },
    order()  { return builder; },
    limit()  { return builder; },
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function fakeClient(result: { data: unknown; error: unknown }) {
  return {
    from: (_table: string) => fakeBuilder(result),
    rpc:  (_fn: string)    => fakeBuilder(result),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  } as any;
}

afterEach(() => resetQueryFaultSink());

describe('instrumentSupabase', () => {
  it('reports a failed query that the caller discards', async () => {
    // The exact house pattern: destructure data, never look at error.
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const supabase = instrumentSupabase(
      fakeClient({ data: null, error: { code: '42703', message: 'column does not exist' } }),
      'test:server',
    );

    const { data } = await supabase.from('candidates').select('id').eq('x', 1);

    expect(data).toBeNull();
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({
      context: 'test:server',
      table:   'candidates',
      code:    '42703',
      message: 'column does not exist',
    });
  });

  it('reports an error even when data is also present', async () => {
    // PostgREST can answer with partial data alongside an error, and
    // "only report when data is null" is a plausible-looking
    // optimisation that would silence exactly those. An error is an
    // error regardless of what came back with it.
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const supabase = instrumentSupabase(
      fakeClient({ data: [{ id: 1 }], error: { code: '57014', message: 'statement timeout' } }),
      'test:server',
    );
    await supabase.from('candidates').select('id');

    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe('57014');
  });

  it('stays silent on success', async () => {
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const supabase = instrumentSupabase(fakeClient({ data: [{ id: 1 }], error: null }), 'test:server');
    const { data } = await supabase.from('candidates').select('id');

    expect(data).toEqual([{ id: 1 }]);
    expect(faults).toEqual([]);
  });

  it('survives the full chain and returns the result shape unchanged', async () => {
    const result = { data: [{ id: 7 }], error: null, count: 1, status: 200, statusText: 'OK' };
    const supabase = instrumentSupabase(
      { from: () => fakeBuilder(result as any), rpc: () => fakeBuilder(result as any) } as any,
      'test:server',
    );
    const out = await supabase.from('t').select('*').eq('a', 1).order('id').limit(10);
    expect(out).toEqual(result);
  });

  it('reports RPC failures with the function name', async () => {
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const supabase = instrumentSupabase(
      fakeClient({ data: null, error: { code: 'PGRST202', message: 'function not found' } }),
      'test:server',
    );
    await supabase.rpc('get_my_role');

    expect(faults[0].table).toBe('rpc:get_my_role');
  });

  it('never throws when the sink itself is broken', async () => {
    // A reporting layer that can break a page is worse than the silence
    // it replaces.
    setQueryFaultSink(() => { throw new Error('sink exploded'); });
    const supabase = instrumentSupabase(fakeClient({ data: null, error: { message: 'boom' } }), 'test:server');
    await expect(supabase.from('t').select('*')).resolves.toBeDefined();
  });

  it('leaves a client with no from/rpc alone', () => {
    const bare = { auth: {} } as any;
    expect(() => instrumentSupabase(bare, 'test')).not.toThrow();
  });
});

describe('instrumenting the same client twice adds no second layer', () => {
  // WHY THIS EXISTS
  //
  // `createBrowserClient` is a SINGLETON in the browser, and
  // `instrumentSupabase` mutates the client in place. `createClient()` sits
  // in the body of 65 client components, so it runs on every render — one
  // more layer per keystroke in a controlled input. Layers are cumulative:
  // each adds a nested Proxy per chained method and a nested synchronous
  // `then` frame, until a Save built after a long editing session dies with
  // "Maximum call stack size exceeded".
  //
  // The layer count is the property that was wrong, so it is the property
  // asserted. It cannot be measured by "does a query still work" — a
  // twenty-layer client returns exactly the right answer, slowly — but
  // every layer re-reports the same failed query, so the number of faults
  // for ONE failure counts the layers exactly.

  it('reports one fault per failure, not one per instrumentation', async () => {
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const client = fakeClient({ data: null, error: { code: '42703', message: 'column does not exist' } });
    for (let i = 0; i < 20; i++) instrumentSupabase(client, 'test:browser');

    await client.from('dev_plans').select('id');

    // Without the guard this is 20.
    expect(faults).toHaveLength(1);
  });

  it('does not reinstall `from` and `rpc` on a second pass', () => {
    // Reinstalling them is the mutation itself: the new wrapper captures
    // the previous wrapper as "the original", and that is what stacks.
    //
    // Note the trap — `instrumentSupabase` returns the SAME object it was
    // given, so comparing `twice.from` to `once.from` compares one
    // property against itself and passes however broken the guard is.
    // (It did, under mutation, until this was rewritten.) The wrappers
    // have to be captured BEFORE the second call.
    const client = instrumentSupabase(fakeClient({ data: null, error: null }), 'test:browser');
    const fromAfterFirst = client.from;
    const rpcAfterFirst  = client.rpc;

    instrumentSupabase(client, 'test:browser');

    expect(client.from).toBe(fromAfterFirst);
    expect(client.rpc).toBe(rpcAfterFirst);
  });

  it('still instruments a genuinely different client', async () => {
    // The guard must key on the object, not on a module-level flag —
    // otherwise the second client in a process (server render after a
    // browser one, or two contexts) silently loses its reporting.
    const faults: QueryFault[] = [];
    setQueryFaultSink(f => faults.push(f));

    const a = instrumentSupabase(fakeClient({ data: null, error: { message: 'a failed' } }), 'test:a');
    const b = instrumentSupabase(fakeClient({ data: null, error: { message: 'b failed' } }), 'test:b');
    await a.from('t1').select('*');
    await b.from('t2').select('*');

    expect(faults.map(f => f.context)).toEqual(['test:a', 'test:b']);
  });

  it('does not add an enumerable key to the client', () => {
    // The marker rides on the client object, which is passed around and
    // occasionally spread. A string key would show up in Object.keys and
    // in JSON.
    const client = instrumentSupabase(fakeClient({ data: null, error: null }), 'test');
    expect(Object.keys(client)).toEqual(['from', 'rpc', 'auth']);
    expect(JSON.stringify(client)).not.toContain('instrumented');
  });
});

describe('the singleton this guard defends against is real', () => {
  // The guard above is worth nothing if `createClient()` actually hands
  // back a fresh client each time — so the premise is measured rather than
  // asserted in a comment. `@supabase/ssr` caches the browser client
  // (`isSingleton` defaults true) and returns `cachedBrowserClient`, which
  // is what makes repeated instrumentation cumulative.
  it('createBrowserClient returns the same object in a browser', async () => {
    const hadWindow = 'window' in globalThis;
    // `isBrowser()` in @supabase/ssr is
    //   typeof window !== 'undefined' && typeof window.document !== 'undefined'
    // — so `document` must hang off `window`, not off globalThis. Setting
    // only the latter makes this test pass while measuring nothing, which
    // is how it failed first.
    (globalThis as any).window = (globalThis as any).window ?? { document: { cookie: '' } };
    // The auth client's cookie recovery reads a bare `document` on an
    // async path; without this it logs a ReferenceError that looks like a
    // failure and is not one.
    (globalThis as any).document = (globalThis as any).document ?? (globalThis as any).window.document;
    try {
      const { createBrowserClient } = await import('@supabase/ssr');
      const url = 'https://example.supabase.co';
      const key = 'a'.repeat(40);
      const first  = createBrowserClient(url, key);
      const second = createBrowserClient(url, key);
      expect(second).toBe(first);
    } finally {
      if (!hadWindow) {
        delete (globalThis as any).window;
        delete (globalThis as any).document;
      }
    }
  });
});
