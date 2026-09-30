import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText, optionalUuid, shortText, longText, z } from '@/lib/validation/primitives';
import { askJev } from '@/lib/jev/client';
import { ramsSectionQuestions, ramsSectionState, toRamsSectionSuggestions, type RamsSiteContext } from '@/lib/hs/ramsSectionQuestions';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

// Lifting/plant asset types a RAMS's own "lifting arrangements"/
// "plant and equipment" sections would actually be about — the same
// HS_ASSET_TYPES union (lib/hs/vocab.ts), never a guessed subset.
const LIFTING_PLANT_ASSET_TYPES = ['plant', 'machinery', 'lifting_equipment'];
const RECENT_INCIDENTS_WINDOW_DAYS = 365; // the same "trailing 12 months" window lib/hs/kpis.ts already uses elsewhere

// POST /api/protect/jev/rams-section — Core-OS 360 Phase 15: Intelligent
// RAMS. Suggests which CONDITIONAL method-statement sections a draft's
// scope of work likely needs real content in — never what that content
// should say (Jev cannot draft free text, only answer bounded
// questions — see lib/hs/ramsSectionQuestions.ts's own header comment).
// Own session, company from the session; a suggestion only — this
// route never writes method_statements.

export const runtime = 'nodejs';

// scope_of_work is validated to 8000 chars — method_statements.scope_of_work's
// own CHECK (124), never a narrower ceiling invented here. A draft RAMS
// with a genuinely long scope of work (the DB allows up to 8000) must
// not be refused a suggestion outright; ramsSectionState() separately
// clips what actually reaches Jev to a smaller size, which is a
// different, independent decision from what the field may VALIDLY hold.
const Body = z.object({
  title: shortText(200),
  project_name: optionalShortText(200),
  scope_of_work: longText(8000),
  site_id: optionalUuid,
});

// Reads the verified facts (never invents any) for the RAMS's own
// selected site — only when that site genuinely belongs to the
// caller's own company. An unresolved or cross-company site_id
// silently yields no site context rather than an error: this is an
// enrichment signal, not a hard requirement, and the suggestion
// already works fine with none of it (the pre-Group-5 behaviour).
async function loadSiteContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, companyId: string, siteId: string,
): Promise<RamsSiteContext | null> {
  const { data: site } = await supabase.from('hs_sites').select('id, name').eq('id', siteId).eq('company_id', companyId).maybeSingle();
  if (!site) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_INCIDENTS_WINDOW_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [{ count: openHazards }, { count: liftingPlant }, { count: recentIncidents }] = await Promise.all([
    supabase.from('hazards').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('site_id', siteId).not('status', 'in', '(closed,archived)'),
    supabase.from('hs_equipment').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('site_id', siteId).in('asset_type', LIFTING_PLANT_ASSET_TYPES).neq('status', 'decommissioned'),
    supabase.from('hs_incidents').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('site_id', siteId).gte('occurred_on', cutoffIso),
  ]);

  return {
    siteName: (site as { name: string }).name,
    openHazardsCount: openHazards ?? 0,
    liftingPlantCount: liftingPlant ?? 0,
    recentIncidentsCount: recentIncidents ?? 0,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { companyId, featureFlags } = await getSessionProfile();
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const rl = limiters.vendor.check(getUserRateLimitKey(req, user.id));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const siteContext = parsed.data.site_id ? await loadSiteContext(supabase, companyId, parsed.data.site_id) : null;

  const result = await askJev(supabase, {
    kind: 'rams_section_suggest', companyId, entityType: 'method_statement', entityId: null,
    actor: { id: user.id, kind: 'client' }, flags: (featureFlags ?? null) as Record<string, unknown> | null,
    state: ramsSectionState(parsed.data.title, parsed.data.project_name ?? null, parsed.data.scope_of_work, siteContext),
    questions: ramsSectionQuestions(),
  });
  if (!result) return NextResponse.json({ suggested_sections: [], decision_id: null, reason: 'unavailable' });

  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;

  return NextResponse.json({ suggested_sections: toRamsSectionSuggestions(selected), decision_id: result.decisionId, reason: null });
}
