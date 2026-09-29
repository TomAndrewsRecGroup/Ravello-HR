import { describe, expect, it } from 'vitest';
import { buildAttentionQueue } from '../attentionQueue';

const TODAY = new Date('2026-09-29T00:00:00Z');
const orgNames = new Map([['co-a', 'ABC Manufacturing']]);

const empty = {
  orgNames, today: TODAY,
  actions: [], legalObligations: [], documentsReviewDue: [], incidents: [],
  deploymentStatus: [], equipment: [], auditFindings: [], contractors: [],
  contractorInsurances: [], environmentalPermits: [], managementReviews: [], serviceRequests: [],
};

describe('buildAttentionQueue', () => {
  it('returns nothing when every source is clean', () => {
    expect(buildAttentionQueue(empty)).toEqual([]);
  });

  it('includes an open critical action, excludes a closed or low-severity one', () => {
    const out = buildAttentionQueue({
      ...empty,
      actions: [
        { id: 'a1', company_id: 'co-a', status: 'active', severity: 'critical', title: 'Fix fire door', due_date: '2026-09-01', assigned_to: null },
        { id: 'a2', company_id: 'co-a', status: 'complete', severity: 'critical', title: 'Done already', due_date: null, assigned_to: null },
        { id: 'a3', company_id: 'co-a', status: 'active', severity: 'low', title: 'Minor', due_date: null, assigned_to: null },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'action:a1', clientName: 'ABC Manufacturing', severity: 'critical', state: 'Fix fire door' });
    expect(out[0].ageDays).toBe(28); // 2026-09-29 - 2026-09-01
  });

  it('resolves an unknown org id to a safe fallback name, never throwing', () => {
    const out = buildAttentionQueue({
      ...empty,
      actions: [{ id: 'a1', company_id: 'co-unknown', status: 'active', severity: 'high', title: 'x', due_date: null, assigned_to: null }],
    });
    expect(out[0].clientName).toBe('Unknown client');
  });

  it('a worker with a safety-critical gap is severity high; one merely not-ready is medium', () => {
    const out = buildAttentionQueue({
      ...empty,
      deploymentStatus: [
        { person_id: 'p1', company_id: 'co-a', status: 'REVIEW_REQUIRED', full_name: 'Jane Doe', result: { summary: { safety_critical_gap: true } } },
        { person_id: 'p2', company_id: 'co-a', status: 'REVIEW_REQUIRED', full_name: 'John Smith', result: { summary: { safety_critical_gap: false } } },
        { person_id: 'p3', company_id: 'co-a', status: 'READY', full_name: 'Clean', result: { summary: { safety_critical_gap: false } } },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.find(i => i.key === 'workforce:p1')?.severity).toBe('high');
    expect(out.find(i => i.key === 'workforce:p2')?.severity).toBe('medium');
  });

  it('a READY worker with a stored safety_critical_gap flag still appears — the flag is never re-derived', () => {
    const out = buildAttentionQueue({
      ...empty,
      deploymentStatus: [{ person_id: 'p1', company_id: 'co-a', status: 'READY', full_name: 'x', result: { summary: { safety_critical_gap: true } } }],
    });
    expect(out).toHaveLength(1);
  });

  it('a contractor is flagged once for either non-approval or an expiring policy, and skipped when clean', () => {
    const out = buildAttentionQueue({
      ...empty,
      contractors: [
        { id: 'c1', company_id: 'co-a', approval_status: 'suspended', name: 'Bad Co' },
        { id: 'c2', company_id: 'co-a', approval_status: 'approved', name: 'Expiring Co' },
        { id: 'c3', company_id: 'co-a', approval_status: 'approved', name: 'Clean Co' },
      ],
      contractorInsurances: [
        { id: 'i1', contractor_id: 'c2', expires_on: '2026-10-01', insurance_type: 'employers_liability' },
        { id: 'i2', contractor_id: 'c3', expires_on: '2099-01-01', insurance_type: 'employers_liability' },
      ],
    });
    expect(out.map(i => i.key).sort()).toEqual(['contractor:c1', 'contractor:c2']);
  });

  it('sorts critical first, then by descending age within the same severity', () => {
    const out = buildAttentionQueue({
      ...empty,
      actions: [
        { id: 'a1', company_id: 'co-a', status: 'active', severity: 'high', title: 'newer', due_date: '2026-09-20', assigned_to: null },
        { id: 'a2', company_id: 'co-a', status: 'active', severity: 'critical', title: 'the critical one', due_date: null, assigned_to: null },
        { id: 'a3', company_id: 'co-a', status: 'active', severity: 'high', title: 'older', due_date: '2026-09-01', assigned_to: null },
      ],
    });
    expect(out.map(i => i.key)).toEqual(['action:a2', 'action:a3', 'action:a1']);
  });

  it('a service request severity follows priority, and an incident severity follows its own severity scale', () => {
    const out = buildAttentionQueue({
      ...empty,
      serviceRequests: [{ id: 's1', company_id: 'co-a', status: 'new', subject: 'Urgent query', priority: 'urgent', created_at: '2026-09-01T00:00:00Z' }],
      incidents: [{ id: 'inc1', company_id: 'co-a', status: 'under_investigation', severity: 'fatal', incident_type: 'accident', incident_number: 'INC-001' }],
    });
    expect(out.find(i => i.key === 'service-request:s1')?.severity).toBe('critical');
    expect(out.find(i => i.key === 'incident:inc1')?.severity).toBe('critical');
  });
});
