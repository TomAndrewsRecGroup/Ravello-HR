import { createServiceSupabaseClient, type PortfolioSession } from './portfolioAccess';
import { loadAttentionQueue } from './loadAttentionQueue';
import { buildPreVisitBrief, type PreVisitBrief } from './preVisitBrief';

/** Shared by the visit detail page and (later, Group 4) any route that
 *  needs the same brief — so the two can never disagree about what a
 *  consultant is shown. `excludeVisitId` is the visit BEING planned
 *  itself — its own row must never count as its own "previous visit". */
export async function loadPreVisitBrief(
  portfolio: PortfolioSession, clientOrganisationId: string, excludeVisitId: string | null,
): Promise<PreVisitBrief> {
  const sb = createServiceSupabaseClient();

  const [portfolioItems, { data: pastVisits }] = await Promise.all([
    loadAttentionQueue(portfolio),
    sb.from('consultancy_visits')
      .select('id, scheduled_date, status, shared_summary')
      .eq('client_organisation_id', clientOrganisationId)
      .in('status', ['closed', 'report_issued'])
      .order('scheduled_date', { ascending: false })
      .limit(5),
  ]);

  const previousVisit = ((pastVisits ?? []) as { id: string; scheduled_date: string; status: string; shared_summary: string | null }[])
    .find(v => v.id !== excludeVisitId) ?? null;

  const [{ data: previousVisitActions }, { data: incidents }, { data: milestones }] = await Promise.all([
    previousVisit
      ? sb.from('actions').select('id, title, status, due_date, priority')
          .eq('source_type', 'consultant_visit').eq('source_id', previousVisit.id)
      : Promise.resolve({ data: [] as any[] }),
    sb.from('hs_incidents').select('id, incident_type, severity, created_at')
      .eq('company_id', clientOrganisationId)
      .gt('created_at', previousVisit?.scheduled_date ?? '1900-01-01')
      .order('created_at', { ascending: false }).limit(50),
    sb.from('milestones').select('id, title, status, due_date, pillar')
      .eq('company_id', clientOrganisationId).order('due_date', { ascending: true }).limit(50),
  ]);

  return buildPreVisitBrief({
    clientOrganisationId,
    portfolioItems,
    previousVisit,
    previousVisitActions: (previousVisitActions ?? []) as any[],
    incidentsSinceLastVisit: (incidents ?? []) as any[],
    roadmapMilestones: (milestones ?? []) as any[],
  });
}
