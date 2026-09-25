import { describe, expect, it } from 'vitest';
import { RULES } from '../rules';
import { EMITTED_ENTITIES, REMINDER_ENTITIES, TRIGGERED_ENTITIES, type PlatformEvent } from '../types';
import { REMINDERS } from '@/lib/reminders/rules';
import { NOTIFICATION_TYPES } from '@/lib/notify/types';

// A rule that listens for something nothing emits is a feature that
// never fires and never fails. These make that a test failure.

const emittable = new Set<string>([
  ...TRIGGERED_ENTITIES.flatMap(t => [`${t}.created`, `${t}.updated`, `${t}.deleted`]),
  ...REMINDER_ENTITIES.map(t => `${t}.reminder`),
  ...EMITTED_ENTITIES.flatMap(t => [`${t}.created`, `${t}.updated`, `${t}.deleted`]),
]);

function ev(over: Partial<PlatformEvent> & { entity_type: string; event_type: string }): PlatformEvent {
  return {
    id: 1, occurred_at: '2026-09-25T06:00:00Z', company_id: 'co-1', entity_id: 'row-1', payload: {},
    actor_id: null, actor_kind: 'system', dedupe_key: null, claimed_at: null, processed_at: null, attempts: 0, last_error: null,
    ...over,
  };
}

const ctx = (event: PlatformEvent) => ({
  sb: {} as never, event,
  companyName: async () => 'Sample Co',
  profile: async () => ({ email: 'raiser@example.com', full_name: 'Ray' }),
});

describe('rules registry', () => {
  it('has unique ids', () => {
    const ids = RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rule listens for a key something emits', () => {
    for (const r of RULES) expect(emittable.has(r.on), `${r.id} listens for ${r.on}`).toBe(true);
  });

  it('every reminder entity has a reminder rule, and every reminder rule an entity in REMINDERS', () => {
    const ruleEntities = new Set(RULES.filter(r => r.on.endsWith('.reminder')).map(r => r.on.replace('.reminder', '')));
    for (const e of REMINDER_ENTITIES) expect(ruleEntities.has(e), `no rule for ${e}.reminder`).toBe(true);
    for (const r of REMINDERS) expect(REMINDER_ENTITIES as readonly string[]).toContain(r.entity);
  });

  it('every notification a rule produces has a type in the vocabulary and a link for its audience', async () => {
    const samples: PlatformEvent[] = [
      ev({ entity_type: 'requisitions', event_type: 'created', actor_kind: 'client', payload: { new: { title: 'Engineer' }, old: {}, changed: [] } }),
      ev({ entity_type: 'manatal_match', event_type: 'updated', payload: { candidate_name: 'A', stage_name: 'Interview' } }),
      ev({ entity_type: 'candidates', event_type: 'updated', actor_kind: 'client', payload: { new: { client_status: 'approved', full_name: 'A', requisition_id: 'r' }, old: { client_status: 'shared' }, changed: ['client_status'] } }),
      ev({ entity_type: 'service_requests', event_type: 'created', payload: { new: { subject: 'Help', request_type: 'hr_audit', submitted_by: 'u1' }, old: {}, changed: [] } }),
      ev({ entity_type: 'actions', event_type: 'updated', actor_kind: 'client', payload: { new: { status: 'complete', title: 'Do' }, old: { status: 'active' }, changed: ['status'] } }),
      ev({ entity_type: 'internal_tasks', event_type: 'created', payload: { new: { assigned_to: 'u2', title: 'Call' }, old: {}, changed: [] } }),
      ev({ entity_type: 'companies', event_type: 'updated', payload: { new: { subscription_status: 'past_due' }, old: { subscription_status: 'active' }, changed: ['subscription_status'] } }),
      ...REMINDER_ENTITIES.flatMap(e => (['due_30', 'due_7', 'due_0', 'overdue', 'overdue_w2'] as const).map(bucket =>
        ev({ entity_type: e, event_type: 'reminder', payload: { bucket, due_date: '2026-10-01', row: { title: 'T', task_title: 'T', assigned_to: 'u3', provider_id: 'p1', employee_name: 'E', full_name: 'E', name: 'Doc', subject: 'S', sent_at: '2026-09-01' } } }))),
    ];
    let produced = 0;
    for (const e of samples) {
      for (const r of RULES.filter(r => r.on === `${e.entity_type}.${e.event_type}`)) {
        if (r.when && !r.when(e)) continue;
        for (const c of await r.then(ctx(e))) {
          if (c.kind !== 'notify') continue;
          produced++;
          expect(NOTIFICATION_TYPES as readonly string[], `${r.id} type`).toContain(c.input.type);
          expect(c.input.title.length, `${r.id} title`).toBeGreaterThan(3);
          expect(c.input.audiences.length, `${r.id} audience`).toBeGreaterThan(0);
          const wantsAdmin  = c.input.audiences.some(a => a.kind === 'staff' || a.kind === 'account_owner' || a.kind === 'user' || a.kind === 'provider_users');
          const wantsPortal = c.input.audiences.some(a => a.kind === 'company_admins' || a.kind === 'company_editors');
          if (wantsAdmin)  expect(c.input.link?.admin, `${r.id} admin link`).toBeTruthy();
          if (wantsPortal) expect(c.input.link?.portal, `${r.id} portal link`).toBeTruthy();
        }
      }
    }
    expect(produced).toBeGreaterThan(20);
  });

  it('staff are told about a client-raised role, not a staff-raised one', () => {
    const rule = RULES.find(r => r.id === 'role_raised')!;
    expect(rule.when!(ev({ entity_type: 'requisitions', event_type: 'created', actor_kind: 'client' }))).toBe(true);
    expect(rule.when!(ev({ entity_type: 'requisitions', event_type: 'created', actor_kind: 'staff' }))).toBe(false);
  });

  it('a candidate decision fires only on a client changing client_status to a decision', () => {
    const rule = RULES.find(r => r.id === 'candidate_decided')!;
    const mk = (status: string, actor: PlatformEvent['actor_kind'], changed = ['client_status']) =>
      ev({ entity_type: 'candidates', event_type: 'updated', actor_kind: actor, payload: { new: { client_status: status }, old: {}, changed } });
    expect(rule.when!(mk('approved', 'client'))).toBe(true);
    expect(rule.when!(mk('rejected', 'client'))).toBe(true);
    expect(rule.when!(mk('shared', 'staff'))).toBe(false);
    expect(rule.when!(mk('approved', 'client', ['client_feedback']))).toBe(false);
  });

  it('the service request rule emails the raiser a receipt and tells the account owner', async () => {
    const rule = RULES.find(r => r.id === 'service_request_raised')!;
    const out = await rule.then(ctx(ev({ entity_type: 'service_requests', event_type: 'created', payload: { new: { subject: 'Contract help', request_type: 'hr_audit', urgency: 'high', submitted_by: 'u1' }, old: {}, changed: [] } })));
    expect(out.map(c => c.kind)).toEqual(['notify', 'email']);
    const email = out[1] as Extract<typeof out[number], { kind: 'email' }>;
    expect(email.to).toBe('raiser@example.com');
    expect(email.message.subject).toBe('Received: Contract help');
    expect(email.message.html).toContain('one business day');
    const n = out[0] as Extract<typeof out[number], { kind: 'notify' }>;
    expect(n.input.audiences).toEqual([{ kind: 'account_owner', companyId: 'co-1' }]);
    expect(n.input.urgent).toBe(true);
  });
});
