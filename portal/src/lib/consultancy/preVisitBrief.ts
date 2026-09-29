import type { AttentionQueueItem } from './attentionQueue';

// Core-OS 360 Phase 7, Group 2 (section 2: Pre-Visit Brief).
//
// "Generate a factual brief containing: previous visit actions;
// open/overdue actions; incidents since last visit; overdue documents/
// legal reviews; workforce readiness/training gaps; critical assets/
// contractors; audit findings; roadmap items. No prediction. This is
// aggregation of current evidence."
//
// Every one of those categories except "previous visit actions",
// "incidents since last visit" and "roadmap items" is ALREADY computed
// by buildAttentionQueue() (Phase 6, section 3) — open/overdue actions,
// overdue legal reviews, overdue documents, workforce readiness gaps
// (via person_deployment_status), critical assets (hs_equipment),
// critical contractors, and audit findings are the queue's own
// categories, already correct and already tested. Re-deriving them
// here would be a second, parallel computation of the same facts that
// could drift from the Attention Queue's own numbers — instead this
// function FILTERS the portfolio-wide queue (already fetched once,
// for the whole portfolio) down to one client, the same "never a
// second source of the same fact" discipline this codebase follows
// everywhere else.
//
// "No prediction" is enforced by construction, not by convention:
// every field here is either a direct pass-through of an existing row
// or a plain filter/sort over one. No score, no AI call, nothing
// computed beyond what the source tables already say.

export interface PreVisitBriefVisit {
  id: string;
  scheduled_date: string;
  status: string;
  shared_summary: string | null;
}

export interface PreVisitBriefAction {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string | null;
}

export interface PreVisitBriefIncident {
  id: string;
  incident_type: string | null;
  severity: string | null;
  created_at: string;
}

export interface PreVisitBriefMilestone {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  pillar: string;
}

export interface PreVisitBriefInput {
  clientOrganisationId: string;
  portfolioItems: AttentionQueueItem[];
  previousVisit: PreVisitBriefVisit | null;
  previousVisitActions: PreVisitBriefAction[];
  incidentsSinceLastVisit: PreVisitBriefIncident[];
  roadmapMilestones: PreVisitBriefMilestone[];
}

export interface PreVisitBrief {
  previousVisit: PreVisitBriefVisit | null;
  previousVisitActions: PreVisitBriefAction[];
  openItems: AttentionQueueItem[];
  incidentsSinceLastVisit: PreVisitBriefIncident[];
  roadmapItems: PreVisitBriefMilestone[];
}

// A milestone that is already done or explicitly not started yet is
// not something a consultant needs surfaced on arrival — "in progress"
// and "at risk" are the two states where a site visit could actually
// move the needle.
const RELEVANT_MILESTONE_STATUSES = new Set(['in_progress', 'at_risk']);

export function buildPreVisitBrief(input: PreVisitBriefInput): PreVisitBrief {
  return {
    previousVisit: input.previousVisit,
    previousVisitActions: input.previousVisitActions,
    openItems: input.portfolioItems.filter(i => i.clientOrganisationId === input.clientOrganisationId),
    incidentsSinceLastVisit: input.incidentsSinceLastVisit,
    roadmapItems: input.roadmapMilestones.filter(m => RELEVANT_MILESTONE_STATUSES.has(m.status)),
  };
}
