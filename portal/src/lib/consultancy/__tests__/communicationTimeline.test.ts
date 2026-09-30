import { describe, expect, it } from 'vitest';
import { buildCommunicationTimeline } from '../communicationTimeline';

const empty = { emails: [], broadcasts: [], serviceRequests: [], reports: [], visitReports: [], manualLedgerNotes: [] };

describe('buildCommunicationTimeline', () => {
  it('returns an empty timeline when every source is empty', () => {
    expect(buildCommunicationTimeline(empty)).toEqual([]);
  });

  it('classifies an email as shared_with_client', () => {
    const entries = buildCommunicationTimeline({
      ...empty,
      emails: [{ id: 'e1', subject: 'Your monthly report', to_email: 'client@example.com', sent_at: '2026-09-01T10:00:00Z' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'email', visibility: 'shared_with_client', id: 'email:e1' });
  });

  it('classifies a broadcast action as shared_with_client', () => {
    const entries = buildCommunicationTimeline({
      ...empty,
      broadcasts: [{ id: 'b1', title: 'New policy rollout', created_at: '2026-09-02T10:00:00Z' }],
    });
    expect(entries[0]).toMatchObject({ kind: 'broadcast', visibility: 'shared_with_client' });
  });

  it('a service request produces a client_originated entry, and a SEPARATE shared_with_client entry only once responded', () => {
    const unresponded = buildCommunicationTimeline({
      ...empty,
      serviceRequests: [{ id: 'sr1', subject: 'Need a policy update', status: 'new', created_at: '2026-09-03T10:00:00Z', responded_at: null }],
    });
    expect(unresponded).toHaveLength(1);
    expect(unresponded[0]).toMatchObject({ kind: 'service_request_raised', visibility: 'client_originated' });

    const responded = buildCommunicationTimeline({
      ...empty,
      serviceRequests: [{ id: 'sr2', subject: 'Need a policy update', status: 'complete', created_at: '2026-09-03T10:00:00Z', responded_at: '2026-09-04T09:00:00Z' }],
    });
    expect(responded).toHaveLength(2);
    const kinds = responded.map(e => e.kind).sort();
    expect(kinds).toEqual(['service_request_raised', 'service_request_responded']);
    const respondedEntry = responded.find(e => e.kind === 'service_request_responded')!;
    expect(respondedEntry.visibility).toBe('shared_with_client');
  });

  it('classifies an issued value report as shared_with_client', () => {
    const entries = buildCommunicationTimeline({
      ...empty,
      reports: [{ id: 'r1', title: 'Value Report — Q3 2026', period: 'Q3 2026', created_at: '2026-09-05T10:00:00Z' }],
    });
    expect(entries[0]).toMatchObject({ kind: 'report_issued', visibility: 'shared_with_client' });
    expect(entries[0].summary).toContain('Q3 2026');
  });

  it('classifies an issued visit report as shared_with_client, dated by issued_at not created_at', () => {
    const entries = buildCommunicationTimeline({
      ...empty,
      visitReports: [{ id: 'vr1', version: 2, issued_at: '2026-09-07T10:00:00Z' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'visit_report_issued', visibility: 'shared_with_client', id: 'visit-report:vr1', occurredAt: '2026-09-07T10:00:00Z' });
    expect(entries[0].summary).toContain('v2');
  });

  it('classifies a manual consultancy ledger note as internal_consultancy — never shown to the client', () => {
    const entries = buildCommunicationTimeline({
      ...empty,
      manualLedgerNotes: [{ id: 'n1', summary: 'Flagged a concern to discuss internally before next visit', occurred_at: '2026-09-06T10:00:00Z' }],
    });
    expect(entries[0]).toMatchObject({ kind: 'consultant_note', visibility: 'internal_consultancy' });
  });

  it('merges every source and sorts newest first, regardless of which source it came from', () => {
    const entries = buildCommunicationTimeline({
      emails: [{ id: 'e1', subject: 'Oldest', to_email: 'a@b.com', sent_at: '2026-09-01T00:00:00Z' }],
      broadcasts: [{ id: 'b1', title: 'Middle', created_at: '2026-09-02T00:00:00Z' }],
      serviceRequests: [],
      reports: [{ id: 'r1', title: 'Newest', period: null, created_at: '2026-09-03T00:00:00Z' }],
      visitReports: [],
      manualLedgerNotes: [],
    });
    expect(entries.map(e => e.id)).toEqual(['report:r1', 'broadcast:b1', 'email:e1']);
  });
});
