import { describe, expect, it } from 'vitest';
import { buildPreVisitBrief } from '../preVisitBrief';
import type { AttentionQueueItem } from '../attentionQueue';

const item = (clientOrganisationId: string, key: string): AttentionQueueItem => ({
  key, clientOrganisationId, clientName: 'x', sourceModule: 'm', sourceType: 't', sourceId: '1',
  issueType: 'i', severity: 'medium', owner: null, dueDate: null, ageDays: null, state: 's', link: '/x',
  siteId: null, siteName: null,
});

describe('buildPreVisitBrief', () => {
  it('filters the portfolio-wide queue down to just this client', () => {
    const brief = buildPreVisitBrief({
      clientOrganisationId: 'co-a',
      portfolioItems: [item('co-a', 'a1'), item('co-b', 'b1'), item('co-a', 'a2')],
      previousVisit: null, previousVisitActions: [], incidentsSinceLastVisit: [], roadmapMilestones: [],
    });
    expect(brief.openItems.map(i => i.key)).toEqual(['a1', 'a2']);
  });

  it('passes through the previous visit and its actions unchanged — no re-derivation', () => {
    const previousVisit = { id: 'v1', scheduled_date: '2026-08-01', status: 'closed', shared_summary: 'All good' };
    const previousVisitActions = [{ id: 'act1', title: 'Fix fire door', status: 'active', due_date: null, priority: 'high' }];
    const brief = buildPreVisitBrief({
      clientOrganisationId: 'co-a', portfolioItems: [], previousVisit, previousVisitActions,
      incidentsSinceLastVisit: [], roadmapMilestones: [],
    });
    expect(brief.previousVisit).toEqual(previousVisit);
    expect(brief.previousVisitActions).toEqual(previousVisitActions);
  });

  it('a null previous visit is a real, distinct case (first-ever visit) — never faked as an empty object', () => {
    const brief = buildPreVisitBrief({
      clientOrganisationId: 'co-a', portfolioItems: [], previousVisit: null, previousVisitActions: [],
      incidentsSinceLastVisit: [], roadmapMilestones: [],
    });
    expect(brief.previousVisit).toBeNull();
  });

  it('roadmap items include in_progress and at_risk, exclude not_started and complete', () => {
    const roadmapMilestones = [
      { id: 'm1', title: 'A', status: 'in_progress', due_date: null, pillar: 'protect' },
      { id: 'm2', title: 'B', status: 'at_risk', due_date: null, pillar: 'hire' },
      { id: 'm3', title: 'C', status: 'not_started', due_date: null, pillar: 'lead' },
      { id: 'm4', title: 'D', status: 'complete', due_date: null, pillar: 'protect' },
    ];
    const brief = buildPreVisitBrief({
      clientOrganisationId: 'co-a', portfolioItems: [], previousVisit: null, previousVisitActions: [],
      incidentsSinceLastVisit: [], roadmapMilestones,
    });
    expect(brief.roadmapItems.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('incidents since last visit pass through unfiltered — the caller already scoped them by date', () => {
    const incidentsSinceLastVisit = [{ id: 'i1', incident_type: 'near_miss', severity: 'low', created_at: '2026-09-01' }];
    const brief = buildPreVisitBrief({
      clientOrganisationId: 'co-a', portfolioItems: [], previousVisit: null, previousVisitActions: [],
      incidentsSinceLastVisit, roadmapMilestones: [],
    });
    expect(brief.incidentsSinceLastVisit).toEqual(incidentsSinceLastVisit);
  });
});
