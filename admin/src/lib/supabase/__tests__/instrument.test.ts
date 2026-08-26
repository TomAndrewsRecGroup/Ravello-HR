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
