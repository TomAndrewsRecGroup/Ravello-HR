import { beforeEach, describe, expect, it, vi } from 'vitest';

// Starting offboarding used to mark the employee TERMINATED on the spot,
// weeks before their last day. The route sets end_date and keeps the
// record active until then; a last working day already past is
// terminated at once. Drives the real handler against a small stateful
// fake with the same chains the route uses.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let session: { user: { id: string } | null; role: string; companyId: string | null };

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Row[] = [];
  let patch: Row = {};
  let wantCount = false;
  let single: 'single' | 'maybe' | null = null;
  const q: any = {
    select() { return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    update(p: Row, o?: { count?: string }) { op = 'update'; patch = p; wantCount = !!o?.count; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    single() { single = 'single'; return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    if (op === 'select') {
      const hit = rows.filter(r => filters.every(f => f(r)));
      return { data: single ? hit[0] ?? null : hit, error: single === 'single' && !hit[0] ? { message: 'no rows' } : null };
    }
    if (op === 'insert') {
      const inserted = payload.map((r, i) => ({ id: `${name}-${rows.length + i + 1}`, ...r }));
      rows.push(...inserted);
      return { data: single ? inserted[0] : inserted, error: null };
    }
    const hit = rows.filter(r => filters.every(f => f(r)));
    hit.forEach(r => Object.assign(r, patch));
    return { data: null, error: null, count: wantCount ? hit.length : null };
  }
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ from: (t: string) => builder(t) }),
  getSessionProfile: () => Promise.resolve(session),
}));

const { POST } = await import('../route');

function start(body: unknown) {
  return POST(new Request('https://portal.thepeoplesystem.co.uk/api/portal/offboarding/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any);
}
const EMP = '11111111-1111-4111-8111-111111111111';
const TMPL = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  session = { user: { id: 'u-1' }, role: 'client_admin', companyId: 'co-1' };
  tables = {
    employee_records: [{ id: EMP, company_id: 'co-1', status: 'active', end_date: null }, { id: OTHER, company_id: 'co-2', status: 'active', end_date: null }],
    offboarding_templates: [{ id: TMPL, company_id: 'co-1', offboarding_template_tasks: [
      { title: 'Return laptop', category: 'asset_return', due_day_offset: 0, assigned_to: 'IT', sort_order: 2 },
      { title: 'Handover notes', category: 'knowledge_transfer', due_day_offset: -5, sort_order: 1 },
    ] }],
    offboarding_instances: [], offboarding_task_progress: [],
  };
});

describe('POST /api/portal/offboarding/start', () => {
  it('a future last day: instance + dated tasks, end_date set, the record stays ACTIVE', async () => {
    const res = await start({ employee_id: EMP, template_id: TMPL, last_working_day: '2099-10-31', reason: 'resignation' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, tasks: 2, terminated: false });
    expect(tables.offboarding_instances).toHaveLength(1);
    expect(tables.offboarding_instances[0]).toMatchObject({ company_id: 'co-1', employee_id: EMP, template_id: TMPL, last_working_day: '2099-10-31', reason: 'resignation', status: 'in_progress' });
    expect(tables.offboarding_task_progress.map(t => [t.task_title, t.due_date, t.assigned_to, t.sort_order])).toEqual([
      ['Handover notes', '2099-10-26', null, 0],
      ['Return laptop',  '2099-10-31', 'IT', 1],
    ]);
    const emp = tables.employee_records[0];
    expect(emp.status).toBe('active');
    expect(emp.end_date).toBe('2099-10-31');
  });

  it('a last day already past terminates at once', async () => {
    const res = await start({ employee_id: EMP, template_id: TMPL, last_working_day: '2020-01-31', reason: 'retirement' });
    expect((await res.json()).terminated).toBe(true);
    expect(tables.employee_records[0]).toMatchObject({ status: 'terminated', end_date: '2020-01-31' });
  });

  it('refuses a viewer, another company\'s employee, and a bad body', async () => {
    session.role = 'client_user';
    expect((await start({ employee_id: EMP, template_id: TMPL, last_working_day: '2099-10-31', reason: 'other' })).status).toBe(403);
    session.role = 'client_admin';
    expect((await start({ employee_id: OTHER, template_id: TMPL, last_working_day: '2099-10-31', reason: 'other' })).status).toBe(404);
    expect((await start({ employee_id: EMP, template_id: TMPL, last_working_day: 'next friday', reason: 'other' })).status).toBe(400);
    expect((await start({ employee_id: EMP, template_id: TMPL, last_working_day: '2099-10-31', reason: 'fired' })).status).toBe(400);
    expect(tables.offboarding_instances).toHaveLength(0);
    expect(tables.employee_records[0].end_date).toBeNull();
  });
});
