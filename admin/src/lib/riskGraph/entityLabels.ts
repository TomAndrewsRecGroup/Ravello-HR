import type { SupabaseClient } from '@supabase/supabase-js';
import { humanise } from '@/lib/hs/safetyVocab';

// Core-OS 360 Phase 23, Group 1 (closes C8.4 — "neighbour label
// resolution beyond hazards/RAs/legal obligations"). Phase 8's own
// scope note flagged this as a "known, disclosed scope limit":
// labelling every one of the ~40 hs_entity_table() branches would need
// a query per branch. This resolves that concern the same way Phase 9's
// compute.ts already resolved an identical one for platform_events —
// a CURATED label map for the entity types actually worth labelling,
// falling back to a humanised type + truncated id for anything else.
// Batched ONE query per DISTINCT type actually present in a result set
// (never per branch) — risk_graph_neighbors()'s own 500-row/3-hop cap
// already bounds how many distinct types can ever appear at once.
//
// Every column here was verified against its own migration file before
// being added — never guessed from a table name. A handful of entity
// types that looked like good candidates (isolations, consultation
// records, environmental complaints, management reviews) have no
// single clean title/name column and are deliberately left uncurated
// rather than guessing one; they still resolve via the fallback.

export interface EntityRef { entity_type: string; entity_id: string }

interface SimpleEntityConfig { table: string; column: string }

const SIMPLE_ENTITY_CONFIG: Record<string, SimpleEntityConfig> = {
  hazard: { table: 'hazards', column: 'title' },
  risk_assessment: { table: 'risk_assessments', column: 'title' },
  method_statement: { table: 'method_statements', column: 'title' },
  coshh_assessment: { table: 'coshh_assessments', column: 'title' },
  substance: { table: 'substances', column: 'product_name' },
  action: { table: 'actions', column: 'title' },
  audit: { table: 'hs_audits', column: 'title' },
  document: { table: 'hs_documents', column: 'title' },
  equipment: { table: 'hs_equipment', column: 'name' },
  contractor: { table: 'contractors', column: 'name' },
  permit: { table: 'permits', column: 'permit_number' },
  objective: { table: 'objectives', column: 'title' },
  milestone: { table: 'milestones', column: 'title' },
  environmental_aspect: { table: 'environmental_aspects', column: 'activity' },
  // UI/UX cross-linking pass, round 2 (2026-10-03).
  emergency_plan: { table: 'emergency_plans', column: 'title' },
};

function fallbackLabel(entityType: string, entityId: string): string {
  return `${humanise(entityType)} ${entityId.slice(0, 8)}…`;
}

/**
 * Resolves a display label for every distinct (entity_type, entity_id)
 * pair in `refs`, batched one query per distinct type present. Never
 * throws — a failed lookup for one type falls back to the humanised
 * type + truncated id for just that type's rows, the same "a defect
 * here costs a fallback string, never a crashed page" posture this
 * codebase already takes for GlobalSearch/WhatChanged label resolution.
 */
export async function resolveEntityLabels(
  supabase: SupabaseClient,
  refs: EntityRef[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const idsByType = new Map<string, string[]>();
  for (const r of refs) {
    if (!idsByType.has(r.entity_type)) idsByType.set(r.entity_type, []);
    idsByType.get(r.entity_type)!.push(r.entity_id);
  }

  await Promise.all([...idsByType.entries()].map(async ([type, ids]) => {
    try {
      const cfg = SIMPLE_ENTITY_CONFIG[type];
      if (cfg) {
        const { data } = await supabase.from(cfg.table).select(`id, ${cfg.column}`).in('id', ids);
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          const raw = row[cfg.column];
          const text = typeof raw === 'string' ? raw.trim() : '';
          labels.set(`${type}:${row.id}`, text || fallbackLabel(type, String(row.id)));
        }
      } else if (type === 'legal_obligation') {
        const { data: obligations } = await supabase
          .from('organisation_legal_obligations').select('id, legal_requirement_id').in('id', ids);
        const reqIds = [...new Set((obligations ?? []).map((o: { legal_requirement_id: string }) => o.legal_requirement_id))];
        const { data: requirements } = reqIds.length > 0
          ? await supabase.from('legal_requirements').select('id, title').in('id', reqIds)
          : { data: [] as { id: string; title: string }[] };
        const titleByReq = new Map((requirements ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
        for (const o of (obligations ?? []) as { id: string; legal_requirement_id: string }[]) {
          labels.set(`legal_obligation:${o.id}`, titleByReq.get(o.legal_requirement_id) ?? fallbackLabel(type, o.id));
        }
      } else if (type === 'incident') {
        const { data } = await supabase.from('hs_incidents').select('id, incident_type, occurred_on').in('id', ids);
        for (const row of (data ?? []) as { id: string; incident_type: string; occurred_on: string }[]) {
          labels.set(`incident:${row.id}`, `${humanise(row.incident_type)} — ${row.occurred_on}`);
        }
      }
    } catch {
      // Fall through — the loop below fills every unresolved key.
    }
  }));

  for (const r of refs) {
    const key = `${r.entity_type}:${r.entity_id}`;
    if (!labels.has(key)) labels.set(key, fallbackLabel(r.entity_type, r.entity_id));
  }
  return labels;
}

// A generic href for a neighbour. Hazards and risk assessments (and,
// derivatively, method statements/COSHH/substances — all portal-only,
// no admin per-record page, per Phase 8's own established note) always
// resolve to a portal path, the exact pattern RiskGraphClient.tsx
// already uses for hazards/risk assessments. Every other curated type
// gets a real per-company admin tab (HsCompanyTabs.tsx's own segment
// list, checked live before writing this) or a portal list page; an
// uncurated type gets no link at all rather than a guessed one.
//
// `portalBase` is an explicit parameter, never an imported constant —
// this file must stay a true byte-identical shared-dupe pair, and
// admin's own `portalUrl()` helper (to link OUT) has no portal-side
// equivalent (linking to itself would be self-referential). The admin
// caller passes `portalUrl()`'s own resolved string; the portal caller
// passes `''`, so a "portal-only" type resolves to a plain relative
// path when the page itself IS the portal. The same
// `ComplianceTwinView.tsx` precedent (Phase 12, Group 2): "each page
// supplies its own correct hrefs" rather than this file guessing a
// shared routing suffix.
const PORTAL_ONLY_TYPES = new Set(['hazard', 'risk_assessment', 'method_statement', 'coshh_assessment', 'substance']);
const PORTAL_RECORD_TYPES = new Set(['hazard', 'risk_assessment', 'incident']);

const PORTAL_PATH: Record<string, string> = {
  hazard: '/protect/hazards', risk_assessment: '/protect/risk-assessments',
  method_statement: '/protect/rams', coshh_assessment: '/protect/coshh', substance: '/protect/substances',
  incident: '/protect/incidents', action: '/protect/actions', audit: '/protect/audits',
  document: '/protect/documents', equipment: '/protect/equipment', contractor: '/protect/contractors',
  permit: '/protect/permits', objective: '/protect/objectives', milestone: '/roadmap',
  environmental_aspect: '/protect/environmental-aspects', legal_obligation: '/protect/legal-register',
  emergency_plan: '/protect/emergency-plans',
};

const ADMIN_SEGMENT: Record<string, string> = {
  incident: 'incidents', audit: 'audits', document: 'documents', equipment: 'equipment',
  contractor: 'contractors', permit: 'permits', objective: 'objectives',
  environmental_aspect: 'environmental-aspects', legal_obligation: 'legal',
  emergency_plan: 'emergency-plans',
};

export function hrefForEntity(
  entityType: string, entityId: string,
  opts: { role: 'admin' | 'portal'; companyId?: string | null; portalBase?: string },
): string | null {
  const { role, companyId, portalBase = '' } = opts;
  if (role === 'admin' && companyId && !PORTAL_ONLY_TYPES.has(entityType)) {
    if (entityType === 'audit') return `/health-safety/${companyId}/audits/${entityId}`;
    const seg = ADMIN_SEGMENT[entityType];
    return seg ? `/health-safety/${companyId}/${seg}` : null;
  }
  const path = PORTAL_PATH[entityType];
  if (!path) return null;
  return PORTAL_RECORD_TYPES.has(entityType) ? `${portalBase}${path}/${entityId}` : `${portalBase}${path}`;
}
