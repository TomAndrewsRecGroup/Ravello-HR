import { createServiceSupabaseClient } from './portfolioAccess';
import type { VisitObservation, ConsultancyVisitTemplateItem } from './types';

export interface LinkableRecord { id: string; label: string }
export interface ObservationEvidenceFile { id: string; entity_id: string; storage_path: string; file_name: string }

export interface VisitCaptureData {
  observations: VisitObservation[];
  evidenceByObservation: Record<string, ObservationEvidenceFile[]>;
  templateItems: ConsultancyVisitTemplateItem[];
  linkableAssets: LinkableRecord[];
  linkableContractors: LinkableRecord[];
  linkablePeople: LinkableRecord[];
  linkableDocuments: LinkableRecord[];
}

/** Everything the mobile/tablet capture UI needs for one visit, in one
 *  round trip per source table. The four "linkable" lists are kept
 *  small and name-only (id + a display label) — this is a picker, not
 *  a full record browser, and the polymorphic link itself is validated
 *  server-side regardless (visit_observation_fill(), 174) so a stale or
 *  tampered id here is refused at INSERT time, not trusted from this list. */
export async function loadVisitCapture(
  clientOrganisationId: string, visitId: string, templateId: string | null,
): Promise<VisitCaptureData> {
  const sb = createServiceSupabaseClient();

  const [{ data: observations }, { data: templateItems }, { data: assets }, { data: contractors }, { data: people }, { data: documents }] = await Promise.all([
    sb.from('visit_observations').select('*').eq('visit_id', visitId).order('created_at', { ascending: false }),
    templateId
      ? sb.from('consultancy_visit_template_items').select('*').eq('template_id', templateId).order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as ConsultancyVisitTemplateItem[] }),
    sb.from('hs_equipment').select('id, name').eq('company_id', clientOrganisationId).neq('status', 'decommissioned').order('name').limit(500),
    sb.from('contractors').select('id, name').eq('company_id', clientOrganisationId).order('name').limit(500),
    sb.from('people').select('id, full_name').eq('company_id', clientOrganisationId).eq('active_status', 'active').order('full_name').limit(500),
    sb.from('hs_documents').select('id, title').eq('company_id', clientOrganisationId).eq('status', 'active').order('title').limit(500),
  ]);

  const obsRows = (observations ?? []) as VisitObservation[];
  const evidenceByObservation: Record<string, ObservationEvidenceFile[]> = {};
  if (obsRows.length > 0) {
    const { data: files } = await sb.from('hs_files')
      .select('id, entity_id, storage_path, file_name')
      .eq('entity_type', 'visit_observation')
      .in('entity_id', obsRows.map(o => o.id));
    for (const f of (files ?? []) as ObservationEvidenceFile[]) {
      (evidenceByObservation[f.entity_id] ??= []).push(f);
    }
  }

  return {
    observations: obsRows,
    evidenceByObservation,
    templateItems: (templateItems ?? []) as ConsultancyVisitTemplateItem[],
    linkableAssets: (assets ?? []).map(a => ({ id: a.id, label: a.name })),
    linkableContractors: (contractors ?? []).map(c => ({ id: c.id, label: c.name })),
    linkablePeople: (people ?? []).map(p => ({ id: p.id, label: p.full_name })),
    linkableDocuments: (documents ?? []).map(d => ({ id: d.id, label: d.title })),
  };
}
