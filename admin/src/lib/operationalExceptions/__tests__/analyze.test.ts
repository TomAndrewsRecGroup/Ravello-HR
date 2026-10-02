import { describe, expect, it } from 'vitest';
import { computeOperationalExceptions, type AssetRow, type PersonStatusRow } from '../analyze';

const TODAY = '2026-10-02';

function person(id: string, status: string, fullName = id): PersonStatusRow {
  return { personId: id, fullName, status };
}

function asset(over: Partial<AssetRow> & { id: string }): AssetRow {
  return { name: over.id, status: 'in_service', nextInspectionDue: null, ...over };
}

describe('computeOperationalExceptions: people', () => {
  it('a READY person with no stale check-in is never an exception', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'READY')],
      staleCheckins: [],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions).toEqual([]);
  });

  it('a single signal alone (not_ready only) is never an exception', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'NOT_READY')],
      staleCheckins: [],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions).toEqual([]);
  });

  it('a single signal alone (stale check-in only) is never an exception', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'READY')],
      staleCheckins: [{ personId: 'p1' }],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions).toEqual([]);
  });

  it('not_ready + stale check-in together IS an exception, with both signals named', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'NOT_READY', 'Alice')],
      staleCheckins: [{ personId: 'p1' }],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions).toEqual([
      { entityType: 'person', personId: 'p1', label: 'Alice', signals: ['not_ready', 'stale_checkin'] },
    ]);
  });

  it('REVIEW_REQUIRED (any non-READY status) counts as not_ready, not only NOT_READY literally', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'REVIEW_REQUIRED')],
      staleCheckins: [{ personId: 'p1' }],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions).toHaveLength(1);
  });

  it('multiple stale check-in rows for the same person never double-count the signal', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [person('p1', 'NOT_READY')],
      staleCheckins: [{ personId: 'p1' }, { personId: 'p1' }],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions[0].signals).toEqual(['not_ready', 'stale_checkin']);
  });
});

describe('computeOperationalExceptions: assets', () => {
  it('a single signal alone (unavailable only) is never an exception', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', status: 'quarantined' })],
      openIsolations: [], openPermits: [],
    });
    expect(out.assetExceptions).toEqual([]);
  });

  it('unavailable + overdue inspection together IS an exception', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', name: 'Forklift 1', status: 'out_of_service', nextInspectionDue: '2026-09-01' })],
      openIsolations: [], openPermits: [],
    });
    expect(out.assetExceptions).toEqual([
      { entityType: 'asset', assetId: 'a1', label: 'Forklift 1', signals: ['unavailable', 'overdue_inspection'] },
    ]);
  });

  it('an in-service asset with an open isolation AND an open permit is still an exception, independent of status/inspection', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', status: 'in_service' })],
      openIsolations: [{ assetId: 'a1' }], openPermits: [{ assetId: 'a1' }],
    });
    expect(out.assetExceptions[0].signals).toEqual(['open_isolation', 'open_permit']);
  });

  it('decommissioned is never counted as "unavailable" — it is a terminal state, not an operational problem', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', status: 'decommissioned', nextInspectionDue: '2020-01-01' })],
      openIsolations: [], openPermits: [],
    });
    // overdue_inspection fires (the date really is overdue, regardless of status), but with no second
    // signal that is still below the threshold.
    expect(out.assetExceptions).toEqual([]);
  });

  it('a future inspection due date never counts as overdue', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', status: 'out_of_service', nextInspectionDue: '2030-01-01' })],
      openIsolations: [], openPermits: [],
    });
    expect(out.assetExceptions).toEqual([]);
  });

  it('an isolation/permit referencing a DIFFERENT asset never attaches to this one', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [], staleCheckins: [],
      assets: [asset({ id: 'a1', status: 'quarantined' })],
      openIsolations: [{ assetId: 'a2' }], openPermits: [{ assetId: 'a2' }],
    });
    expect(out.assetExceptions).toEqual([]);
  });
});

describe('computeOperationalExceptions: determinism', () => {
  it('sorts by signal count descending, then label ascending as a tiebreak', () => {
    const out = computeOperationalExceptions({
      today: TODAY,
      people: [
        person('p1', 'NOT_READY', 'Zed'),
        person('p2', 'NOT_READY', 'Amy'),
      ],
      staleCheckins: [{ personId: 'p1' }, { personId: 'p2' }],
      assets: [], openIsolations: [], openPermits: [],
    });
    expect(out.personExceptions.map(e => e.label)).toEqual(['Amy', 'Zed']);
  });
});
