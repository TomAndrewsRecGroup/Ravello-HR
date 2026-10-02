import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import AdminTopbar from '@/components/layout/AdminTopbar';
import BroadcastClient from './BroadcastClient';
import RecentBroadcasts from './RecentBroadcasts';
import { buildLegalPrefill } from '@/lib/governance/broadcastPrefill';

export const metadata: Metadata = { title: 'Broadcast' };
export const dynamic = 'force-dynamic';

// Service-role read so the lists are always live (bypasses RLS,
// admin-only page anyway).
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// A ?update=<latest_updates id> query param (the link on a
// "regulatory_change_detected" staff notification — see
// lib/latestUpdates/classify.ts) pre-fills the compose form and
// pre-selects every client whose own register already holds an item in
// the category Jev suggested. Nothing about that classification is
// trusted further than a prefill: the staff member reviews and edits
// before pressing Send, exactly as any other broadcast.
async function loadPrefill(sb: ReturnType<typeof adminClient>, updateId: string | undefined) {
  if (!updateId) return null;
  const { data: update } = await sb.from('latest_updates')
    .select('id, title, description, regulatory_category').eq('id', updateId).maybeSingle();
  if (!update || !update.regulatory_category || update.regulatory_category === 'none') return null;
  const { data: items } = await sb.from('compliance_items').select('company_id').eq('category', update.regulatory_category);
  const companyIds = [...new Set((items ?? []).map((i: { company_id: string }) => i.company_id))];
  return {
    title: `Regulatory update: ${update.title}`.slice(0, 200),
    description: update.description ?? '',
    companyIds,
    // Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7) —
    // see broadcastPrefill.ts's own BroadcastPrefillResult comment.
    sourceType: 'regulatory_update' as const,
    sourceId: update.id,
  };
}

// Core-OS 360 Phase 5, Group 8: the Legal Register's own "Broadcast"
// link (?legal=<legal_requirements id>, from LegalRequirementsCatalogueClient)
// pre-fills the SAME compose form and reuses the SAME confirm-modal
// flow as the regulatory-update prefill above — never a second, weaker
// notification path. Affected clients are read from their own
// organisation_legal_obligations row: only companies that have
// actually recorded this requirement as 'applicable' are pre-selected,
// never every client on the platform. As with loadPrefill above, this
// is a starting point a staff member reviews and can change or clear
// entirely before Send — nothing here sends on its own.
async function loadLegalPrefill(sb: ReturnType<typeof adminClient>, legalId: string | undefined) {
  if (!legalId) return null;
  const { data: requirement } = await sb.from('legal_requirements')
    .select('id, title').eq('id', legalId).maybeSingle();
  const { data: obligations } = await sb.from('organisation_legal_obligations')
    .select('company_id').eq('legal_requirement_id', legalId).eq('applicability_status', 'applicable');
  return buildLegalPrefill(requirement, (obligations ?? []).map((o: { company_id: string }) => o.company_id));
}

export default async function BroadcastPage(props: { searchParams: Promise<{ update?: string; legal?: string }> }) {
  const searchParams = await props.searchParams;
  const sb = adminClient();

  // 1. Active companies for the picker
  // 2. Recent admin-broadcast actions, grouped client-side. We pull a
  //    healthy buffer (last 200 admin-created actions in the last
  //    90 days) and the client groups by title+created_at-second so
  //    a 50-company broadcast collapses to one row.
  // 3. A prefill from a regulatory-change suggestion, or from the Legal
  //    Register's own Broadcast link, when linked here. At most one of
  //    the two query params is expected in practice; if both were ever
  //    present, the regulatory-update prefill wins (it is the one this
  //    page has supported longest).
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const [companiesRes, actionsRes, updatePrefill, legalPrefill] = await Promise.all([
    sb.from('companies').select('id, slug, name, active').order('name'),
    sb.from('actions')
      .select('id, title, description, action_type, priority, due_date, created_at, company_id, status, source_type, source_id, companies(id, slug, name)')
      .eq('created_by_admin', true)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200),
    loadPrefill(sb, searchParams?.update),
    loadLegalPrefill(sb, searchParams?.legal),
  ]);
  const prefill = updatePrefill ?? legalPrefill;

  // Who has acknowledged which broadcast-raised action (206) — a
  // by-id-list read, bounded by the same 200-action buffer above, never
  // a second, wider scan. Distinct action_ids only; RecentBroadcasts
  // only needs "has at least one acknowledgement", not who or how many.
  const broadcastActionIds = (actionsRes.data ?? []).map((a: { id: string }) => a.id);
  const { data: ackRows } = broadcastActionIds.length
    ? await sb.from('broadcast_acknowledgements').select('action_id').in('action_id', broadcastActionIds).limit(500)
    : { data: [] as { action_id: string }[] };
  const acknowledgedActionIds = new Set((ackRows ?? []).map((r: { action_id: string }) => r.action_id));

  return (
    <>
      <AdminTopbar
        title="Broadcast"
        subtitle="Send an action item to multiple clients at once"
      />
      <main className="admin-page flex-1 space-y-6">
        <BroadcastClient companies={companiesRes.data ?? []} prefill={prefill} />
        <RecentBroadcasts actions={(actionsRes.data ?? []) as any} acknowledgedActionIds={acknowledgedActionIds} />
      </main>
    </>
  );
}
