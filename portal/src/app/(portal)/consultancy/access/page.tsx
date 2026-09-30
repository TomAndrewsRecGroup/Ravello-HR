import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import AccessGrantClient from './AccessGrantClient';
import type { AccessRole, AccessGrant, Colleague, ConsultancyClientRelationship } from './types';

export const metadata: Metadata = { title: 'Grant Access' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Completion Programme, Phase 24, Group 1 (closes
// gap-ledger row C1.9 — "portal UI for consultancy owners to grant
// access"). Phase 1's own handover (§H) left this as "RPC ready, no
// UI": grant_organisation_access()/revoke_organisation_access() (117)
// have existed, fully guarded, since the very first Core-OS 360
// migration — this page is the first caller either has ever had.
//
// Every write here runs through the RPCs, under the caller's OWN
// session — the RPCs are their own security boundary (self-grant
// refused, only your own colleagues, only a role marked
// consultancy_grantable, only a client you hold a LIVE
// consultancy_client relationship with). This page pre-filters the
// pickers to plausible choices as a convenience; the database decides,
// not the page.
export default async function AccessGrantPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const supabase = await createServerSupabaseClient();

  const { data: homeId } = await supabase.rpc('my_home_company_id');
  if (!homeId) redirect('/dashboard');

  const { data: canManage } = await supabase.rpc('has_capability', { p_org: homeId, p_cap: 'consultancy.manage_access' });

  if (!canManage) {
    return (
      <main className="portal-page flex-1 space-y-4">
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Grant Access</h1>
        <div className="card p-12"><div className="empty-state">
          <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>
            You do not manage access grants for this organisation.
          </p>
        </div></div>
      </main>
    );
  }

  const [{ data: colleagues }, { data: relationships }, { data: roles }, { data: grants }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').eq('company_id', homeId).order('full_name').limit(500),
    supabase.from('organisation_relationships')
      .select('id, target_organisation_id')
      .eq('source_organisation_id', homeId).eq('relationship_type', 'consultancy_client').eq('status', 'active')
      .order('id').limit(500),
    supabase.from('access_roles').select('key, name').eq('consultancy_grantable', true).order('name'),
    supabase.from('user_organisation_access')
      .select('id, user_id, organisation_id, role_key, access_scope, valid_from, valid_until, active_status')
      .eq('active_status', 'active').order('valid_from', { ascending: false }).limit(500),
  ]);

  const clientIds = [...new Set((relationships ?? []).map(r => r.target_organisation_id))];
  const { data: clients } = clientIds.length
    ? await supabase.from('companies').select('id, name').in('id', clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map((clients ?? []).map(c => [c.id, c.name]));

  // Grants may name a colleague or an organisation not in the lists
  // above (a stale grant against a relationship that has since
  // lapsed) — resolve every id actually referenced, not just the
  // "currently offerable" sets.
  const grantUserIds = [...new Set((grants ?? []).map(g => g.user_id))];
  const grantOrgIds = [...new Set((grants ?? []).map(g => g.organisation_id))];
  const [{ data: grantUsers }, { data: grantOrgs }] = await Promise.all([
    grantUserIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', grantUserIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    grantOrgIds.length ? supabase.from('companies').select('id, name').in('id', grantOrgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const userNameById = new Map((grantUsers ?? []).map(u => [u.id, u.full_name || u.email]));
  const orgNameById = new Map((grantOrgs ?? []).map(o => [o.id, o.name]));

  const relationshipsList: ConsultancyClientRelationship[] = (relationships ?? []).map(r => ({
    id: r.id, targetOrganisationId: r.target_organisation_id, targetOrganisationName: clientNameById.get(r.target_organisation_id) ?? 'Unknown client',
  }));
  const grantsList: AccessGrant[] = (grants ?? []).map(g => ({
    id: g.id, userId: g.user_id, userName: userNameById.get(g.user_id) ?? 'Unknown person',
    organisationId: g.organisation_id, organisationName: orgNameById.get(g.organisation_id) ?? 'Unknown organisation',
    roleKey: g.role_key, accessScope: g.access_scope, validUntil: g.valid_until,
  }));

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Grant Access</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          Give one of your own people access to a client you serve.
        </p>
      </div>
      <AccessGrantClient
        colleagues={(colleagues ?? []) as Colleague[]}
        relationships={relationshipsList}
        roles={(roles ?? []) as AccessRole[]}
        grants={grantsList}
      />
    </main>
  );
}
