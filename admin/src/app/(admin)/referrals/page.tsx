import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import ReferralsClient from './ReferralsClient';

export const metadata: Metadata = { title: 'Referrals' };
export const revalidate = 30;

// Real pagination, not a hard cap — a 500-row `.limit()` silently hid
// every application past the 500 most recent. See CLAUDE.md's
// PostgREST row-cap section: the fix everywhere else in this codebase
// is windowed reads with a real count, and this is that.
const PAGE_SIZE = 100;

const SORT_KEYS = ['candidate', 'role', 'score', 'location', 'status'] as const;
type SortKey = (typeof SORT_KEYS)[number];

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: { page?: string; sort?: string; dir?: string; status?: string; role?: string };
}) {
  const supabase = createServerSupabaseClient();

  const page    = Math.max(1, Number(searchParams?.page ?? '1') || 1);
  const sortKey = (SORT_KEYS as readonly string[]).includes(searchParams?.sort ?? '')
    ? (searchParams!.sort as SortKey)
    : 'created_at';
  // Score defaults to highest-first the first time it's picked; every
  // other column defaults to A→Z / earliest-first — same defaults the
  // client's column-header clicks apply.
  const sortDir: 'asc' | 'desc' = searchParams?.dir === 'asc' || searchParams?.dir === 'desc'
    ? searchParams.dir
    : (sortKey === 'score' ? 'desc' : 'asc');
  // 'queue' is the funnel table's own label for the review_pending
  // status — not a second vocabulary, just the UI's shortcut for it.
  const statusFilter = searchParams?.status && searchParams.status !== 'all'
    ? (searchParams.status === 'queue' ? 'review_pending' : searchParams.status)
    : null;
  const roleFilter = searchParams?.role && searchParams.role !== 'all' ? searchParams.role : null;

  // Sorting/filtering happen in ONE round trip via an RPC, because
  // PostgREST cannot order a top-level resource by a column on a
  // joined table (candidate name, role title both live on the joined
  // tables) — see migration 086. The exact total for THIS filter comes
  // back in the same call via count(*) OVER(); the grand total across
  // every filter is a separate cheap head-count, needed only to tell
  // "no applications at all yet" apart from "none match these filters".
  const [{ data: sortedRows, error: sortErr }, { count: grandTotal }, { count: queueTotal }, { count: qualifiedTotal }, { data: configs }] = await Promise.all([
    supabase.rpc('referral_applications_sorted', {
      p_sort:           sortKey,
      p_dir:             sortDir,
      p_status:          statusFilter,
      p_requisition_id:  roleFilter,
      p_limit:           PAGE_SIZE,
      p_offset:          (page - 1) * PAGE_SIZE,
    }),
    supabase.from('referral_applications').select('*', { count: 'exact', head: true }),
    // The status dropdown's "Review queue (N)" count, across the WHOLE
    // book — deriving it from `rows` (this page's slice) would report
    // however many review_pending rows happened to land on this page,
    // not the real queue size.
    supabase.from('referral_applications').select('*', { count: 'exact', head: true }).eq('status', 'review_pending'),
    // "Send all qualified (N)" — qualified rows are the ones dry run held
    // back, and nothing re-sends them automatically.
    supabase.from('referral_applications').select('*', { count: 'exact', head: true }).eq('status', 'qualified'),
    supabase
      .from('referral_role_config')
      .select('requisition_id, enabled, dry_run, partner_name, auto_send_threshold, review_threshold, requisition:requisitions ( id, title )'),
  ]);

  if (sortErr) {
    // Surfaced rather than silently falling back to an unsorted read —
    // a quiet fallback here is exactly the "reports success while doing
    // nothing" shape this codebase keeps finding and fixing elsewhere.
    throw new Error(`Could not load referrals: ${sortErr.message}`);
  }

  const rawRows  = sortedRows ?? [];
  const total    = rawRows.length > 0 ? Number((rawRows[0] as any).total_count) : 0;
  const rows     = rawRows.map((r: any) => ({
    id:                   r.id,
    status:               r.status,
    match_score:          r.match_score,
    scan_source:          r.scan_source,
    country_detected:     r.country_detected,
    country_gate_result:  r.country_gate_result,
    failed_criteria:      r.failed_criteria,
    matched_skills:       r.matched_skills,
    strengths:            r.strengths,
    gaps:                 r.gaps,
    scan_error:           r.scan_error,
    scanned_at:           r.scanned_at,
    email_sent_at:        r.email_sent_at,
    created_at:           r.created_at,
    manatal_candidate_id: r.manatal_candidate_id,
    candidate:            { id: r.candidate_id, full_name: r.candidate_full_name, email: r.candidate_email },
    requisition:          { id: r.requisition_id, title: r.requisition_title },
  }));
  const grand    = grandTotal ?? total;
  const roleCfgs = configs ?? [];
  const dryRunOn = roleCfgs.filter((c: any) => c.enabled && c.dry_run).length;

  return (
    <>
      <AdminTopbar
        title="Referrals"
        subtitle={`${grand} application${grand === 1 ? '' : 's'} across ${roleCfgs.length} configured role${roleCfgs.length === 1 ? '' : 's'}`}
      />
      <ReferralsClient
        rows={rows as any[]}
        configs={roleCfgs as any[]}
        dryRunCount={dryRunOn}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        grandTotal={grand}
        queueCount={queueTotal ?? 0}
        qualifiedCount={qualifiedTotal ?? 0}
        sortKey={sortKey}
        sortDir={sortDir}
        statusFilter={searchParams?.status ?? 'all'}
        roleFilter={roleFilter ?? 'all'}
      />
    </>
  );
}
