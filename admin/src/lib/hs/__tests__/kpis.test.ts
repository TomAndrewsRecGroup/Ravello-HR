import { describe, expect, it } from 'vitest';
import { computeHsKpis } from '../kpis';

const TODAY = '2026-09-25';

describe('computeHsKpis', () => {
  it('counts incidents and RIDDOR reports within the trailing 12 months only', () => {
    const kpis = computeHsKpis({
      incidents: [
        { severity: 'minor', riddor_reportable: false, occurred_on: '2026-09-01' },
        { severity: 'major', riddor_reportable: true, occurred_on: '2026-01-01' },
        { severity: 'major', riddor_reportable: true, occurred_on: '2024-01-01' }, // outside window
      ],
      activities: [], audits: [], equipment: [], today: TODAY,
    });
    expect(kpis.incidentsLast12Months).toBe(2);
    expect(kpis.riddorLast12Months).toBe(1);
  });

  it('counts toolbox talks logged as activities, ignoring other activity types', () => {
    const kpis = computeHsKpis({
      incidents: [],
      activities: [
        { activity_type: 'toolbox_talk', occurred_on: '2026-08-01' },
        { activity_type: 'toolbox_talk', occurred_on: '2025-09-26' },
        { activity_type: 'site_visit', occurred_on: '2026-08-01' },
      ],
      audits: [], equipment: [], today: TODAY,
    });
    expect(kpis.toolboxTalksLast12Months).toBe(2);
  });

  it('reports the latest audit score and the trend against the previous one', () => {
    const up = computeHsKpis({
      incidents: [], activities: [], equipment: [],
      audits: [{ score: 70, conducted_on: '2026-06-01' }, { score: 90, conducted_on: '2026-09-01' }],
      today: TODAY,
    });
    expect(up.lastAuditScore).toBe(90);
    expect(up.auditScoreTrend).toBe('up');

    const down = computeHsKpis({
      incidents: [], activities: [], equipment: [],
      audits: [{ score: 90, conducted_on: '2026-06-01' }, { score: 70, conducted_on: '2026-09-01' }],
      today: TODAY,
    });
    expect(down.auditScoreTrend).toBe('down');
  });

  it('has no trend with fewer than two audits', () => {
    const kpis = computeHsKpis({
      incidents: [], activities: [], equipment: [],
      audits: [{ score: 90, conducted_on: '2026-09-01' }],
      today: TODAY,
    });
    expect(kpis.lastAuditScore).toBe(90);
    expect(kpis.auditScoreTrend).toBeNull();
  });

  it('counts overdue and due-soon equipment inspections, ignoring out-of-service equipment', () => {
    const kpis = computeHsKpis({
      incidents: [], activities: [], audits: [],
      equipment: [
        { status: 'in_service', next_inspection_due: '2026-09-01' },   // overdue
        { status: 'in_service', next_inspection_due: '2026-10-10' },   // due soon (15 days)
        { status: 'in_service', next_inspection_due: '2027-01-01' },   // not soon
        { status: 'out_of_service', next_inspection_due: '2026-09-01' }, // ignored
        { status: 'in_service', next_inspection_due: null },           // ignored
      ],
      today: TODAY,
    });
    expect(kpis.equipmentOverdueCount).toBe(1);
    expect(kpis.equipmentDueSoonCount).toBe(1);
  });
});
