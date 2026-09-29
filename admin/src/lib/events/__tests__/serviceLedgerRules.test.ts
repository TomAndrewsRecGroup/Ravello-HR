import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';

const auditLogSpy = vi.fn();
vi.mock('@/lib/audit', () => ({ auditLog: (...args: unknown[]) => auditLogSpy(...args) }));

// Core-OS 360 Phase 6, Group 3 (migration 169): the Client Service
// Ledger. Every entry must be attributed by the EVENT'S OWN ACTOR
// (never the event's own company_id) being a consultancy person with a
// LIVE relationship to that client — a Core OS 360 staff action must
// never be logged here, since the ledger's whole purpose is proving
// THIRD-PARTY consultancy value.

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
beforeEach(() => {
  auditLogSpy.mockClear();
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'consultant-1', email: 'c@laws.example.com', role: 'client_editor', company_id: 'co-laws' },
    ],
    companies: [
      { id: 'co-laws', name: 'Laws Safety', organisation_type: 'consultancy' },
      { id: 'co-client', name: 'ABC Manufacturing', organisation_type: 'direct_client' },
    ],
    organisation_relationships: [
      { id: 'rel-1', source_organisation_id: 'co-laws', target_organisation_id: 'co-client', relationship_type: 'consultancy_client', status: 'active', valid_from: '2020-01-01', valid_until: null },
    ],
    consultancy_service_ledger: [],
    platform_events: [], notifications: [], email_log: [], actions: [],
  });
});

describe('service ledger: consultancy audits/documents/actions', () => {
  it('a consultancy person recording an audit for their authorised client logs one ledger entry', async () => {
    const ev = eventRow({
      id: 1, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-1',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Fire safety walk-round' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });

    const rows = db.tables.consultancy_service_ledger;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      consultancy_organisation_id: 'co-laws', client_organisation_id: 'co-client',
      entry_type: 'audit', source_type: 'hs_audits', source_id: 'audit-1',
    });
    expect(rows[0].summary).toContain('Fire safety walk-round');
  });

  it('a Core OS 360 STAFF action never logs to the ledger — the ledger is for third-party consultancy value only', async () => {
    const ev = eventRow({
      id: 2, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-2',
      company_id: 'co-client', actor_id: 'staff-1', actor_kind: 'staff',
      payload: { new: { title: 'Staff-run audit' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(0);
  });

  it('a consultancy person with NO relationship to the event\'s own client logs nothing', async () => {
    const ev = eventRow({
      id: 3, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-3',
      company_id: 'co-stranger', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Unrelated client audit' }, old: {}, changed: [] },
    });
    db.tables.companies.push({ id: 'co-stranger', name: 'Stranger Co', organisation_type: 'direct_client' });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(0);
  });

  it('an ENDED relationship stops new entries, even though the relationship row still exists', async () => {
    db.tables.organisation_relationships[0].status = 'ended';
    const ev = eventRow({
      id: 4, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-4',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Post-termination audit' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(0);
  });

  it('a document reaching active, a service request completed, and an action closed each log their own entry_type', async () => {
    db.tables.platform_events.push(
      eventRow({
        id: 5, entity_type: 'hs_documents', event_type: 'updated', entity_id: 'doc-1',
        company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
        payload: { new: { title: 'Fire policy v2', status: 'active' }, old: { status: 'approved' }, changed: ['status'] },
      }),
      eventRow({
        id: 6, entity_type: 'service_requests', event_type: 'updated', entity_id: 'sr-1',
        company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
        payload: { new: { subject: 'Handbook query', status: 'complete' }, old: { status: 'in_progress' }, changed: ['status'] },
      }),
      eventRow({
        id: 7, entity_type: 'actions', event_type: 'updated', entity_id: 'act-1',
        company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
        payload: { new: { title: 'Fix fire door', status: 'complete' }, old: { status: 'in_progress' }, changed: ['status'] },
      }),
    );
    await processEvents(db.client, { rules: RULES });

    const types = db.tables.consultancy_service_ledger.map((r: any) => r.entry_type).sort();
    expect(types).toEqual(['action_closed', 'document', 'service_request_resolved']);
  });

  it('a Broadcast-created action (created_by_admin) logs entry_type "broadcast" on CREATE, separate from its later closure', async () => {
    db.tables.platform_events.push(eventRow({
      id: 8, entity_type: 'actions', event_type: 'created', entity_id: 'act-2',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'New compliance requirement', created_by_admin: true, status: 'active' }, old: {}, changed: [] },
    }));
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(1);
    expect(db.tables.consultancy_service_ledger[0].entry_type).toBe('broadcast');
  });

  it('an ordinary (non-broadcast) action creation logs nothing — only its later closure does', async () => {
    db.tables.platform_events.push(eventRow({
      id: 9, entity_type: 'actions', event_type: 'created', entity_id: 'act-3',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'A routine action', created_by_admin: false, status: 'active' }, old: {}, changed: [] },
    }));
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(0);
  });

  it('re-processing the same event (retry after a claimed-but-failed attempt) never double-logs — the UNIQUE constraint is the guard', async () => {
    const ev = eventRow({
      id: 10, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-5',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Repeated audit event' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });
    // Simulate a re-run of the SAME already-processed event by
    // resetting processed_at/claimed_at, exactly what a retried claim
    // after a crash would look like.
    ev.processed_at = null; ev.claimed_at = null;
    await processEvents(db.client, { rules: RULES });
    expect(db.tables.consultancy_service_ledger).toHaveLength(1);
  });

  it('a genuine new ledger entry fires service_ledger.entry_created (section 13)', async () => {
    const ev = eventRow({
      id: 11, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-6',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Audited for the audit trail' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });

    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    expect(auditLogSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'service_ledger.entry_created',
      organisation_id: 'co-client',
      target_type: 'consultancy_service_ledger',
    }));
  });

  it('a re-processed (duplicate-skipped) event never fires a second service_ledger.entry_created', async () => {
    const ev = eventRow({
      id: 12, entity_type: 'hs_audits', event_type: 'created', entity_id: 'audit-7',
      company_id: 'co-client', actor_id: 'consultant-1', actor_kind: 'consultant',
      payload: { new: { title: 'Audited once, retried once' }, old: {}, changed: [] },
    });
    db.tables.platform_events.push(ev);
    await processEvents(db.client, { rules: RULES });
    ev.processed_at = null; ev.claimed_at = null;
    await processEvents(db.client, { rules: RULES });

    expect(auditLogSpy).toHaveBeenCalledTimes(1);
  });
});
