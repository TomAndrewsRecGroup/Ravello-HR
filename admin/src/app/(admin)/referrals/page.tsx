import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import ReferralsClient from './ReferralsClient';

export const metadata: Metadata = { title: 'Referrals' };
export const revalidate = 30;

// Real pagination, not a hard cap — a 500-row `.limit()` silently hid
// every application past the 500 most recent, which on a book of 4,700+
// meant the vast majority were never shown at all, sortable or not.
// See CLAUDE.md's PostgREST row-cap section: the fix everywhere else in
// this codebase is windowed reads with a real count, and this is that.
const PAGE_SIZE = 100;

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const supabase = createServerSupabaseClient();

  const page = Math.max(1, Number(searchParams?.page ?? '1') || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const [{ data: applications, count: total }, { data: configs }] = await Promise.all([
    supabase
      .from('referral_applications')
      .select(`
        id, status, match_score, scan_source, country_detected, country_gate_result,
        failed_criteria, matched_skills, strengths, gaps, scan_error,
        scanned_at, email_sent_at, created_at, manatal_candidate_id,
        candidate:candidates ( id, full_name, email ),
        requisition:requisitions ( id, title )
      `, { count: 'exact' })
      // `id` as a tie-break: a batch scan can insert several rows in the
      // same instant, and without a unique column in the sort a page
      // boundary can drop or duplicate a row across two reads.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
    supabase
      .from('referral_role_config')
      .select('requisition_id, enabled, dry_run, partner_name, auto_send_threshold, review_threshold, requisition:requisitions ( id, title )'),
  ]);

  const rows      = applications ?? [];
  const grand     = total ?? rows.length;
  const roleCfgs  = configs ?? [];
  const dryRunOn  = roleCfgs.filter((c: any) => c.enabled && c.dry_run).length;

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
        total={grand}
      />
    </>
  );
}
