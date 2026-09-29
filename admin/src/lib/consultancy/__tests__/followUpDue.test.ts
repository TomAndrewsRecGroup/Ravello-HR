import { describe, expect, it } from 'vitest';
import { reportsNeedingFollowUp } from '../followUpDue';

describe('reportsNeedingFollowUp', () => {
  it('a client with NO later visit still needs the reminder', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [],
    );
    expect(out.map(r => r.id)).toEqual(['r1']);
  });

  it('a DIFFERENT visit already booked ON the recommended date clears it', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [{ client_organisation_id: 'co-a', visit_id: 'v2', scheduled_date: '2026-12-01' }],
    );
    expect(out).toEqual([]);
  });

  it('a visit booked AFTER the recommended date also clears it', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [{ client_organisation_id: 'co-a', visit_id: 'v2', scheduled_date: '2027-01-15' }],
    );
    expect(out).toEqual([]);
  });

  it('a visit booked BEFORE the recommended date does NOT clear it — that is not the follow-up', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [{ client_organisation_id: 'co-a', visit_id: 'v2', scheduled_date: '2026-06-01' }],
    );
    expect(out.map(r => r.id)).toEqual(['r1']);
  });

  it('the visit THE REPORT ITSELF IS ABOUT never counts as its own follow-up, even if its own date qualifies', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [{ client_organisation_id: 'co-a', visit_id: 'v1', scheduled_date: '2027-01-01' }],
    );
    expect(out.map(r => r.id)).toEqual(['r1']);
  });

  it('a later visit booked for a DIFFERENT client never clears this one', () => {
    const out = reportsNeedingFollowUp(
      [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' }],
      [{ client_organisation_id: 'co-b', visit_id: 'v2', scheduled_date: '2027-01-01' }],
    );
    expect(out.map(r => r.id)).toEqual(['r1']);
  });

  it('multiple candidates are judged independently', () => {
    const out = reportsNeedingFollowUp(
      [
        { id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', next_visit_recommended_date: '2026-12-01' },
        { id: 'r2', visit_id: 'v3', client_organisation_id: 'co-b', next_visit_recommended_date: '2026-12-01' },
      ],
      [{ client_organisation_id: 'co-b', visit_id: 'v4', scheduled_date: '2027-01-01' }],
    );
    expect(out.map(r => r.id)).toEqual(['r1']);
  });
});
