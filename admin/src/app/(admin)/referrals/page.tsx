import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import ReferralsClient from './ReferralsClient';

export const metadata: Metadata = { title: 'Referrals' };
export const revalidate = 30;

const PAGE_CAP = 500;

export default async function ReferralsPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: applications }, { count: total }, { data: configs }] = await Promise.all([
    supabase
      .from('referral_applications')
      .select(`
        id, status, match_score, scan_source, country_detected, country_gate_result,
        failed_criteria, matched_skills, strengths, gaps, scan_error,
        scanned_at, email_sent_at, created_at, manatal_candidate_id,
        candidate:candidates ( id, full_name, email ),
        requisition:requisitions ( id, title )
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_CAP),
    supabase.from('referral_applications').select('*', { count: 'exact', head: true }),
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
        subtitle={
          grand > PAGE_CAP
            ? `Showing the ${PAGE_CAP} most recent of ${grand} applications`
            : `${grand} application${grand === 1 ? '' : 's'} across ${roleCfgs.length} configured role${roleCfgs.length === 1 ? '' : 's'}`
        }
      />
      <ReferralsClient
        rows={rows as any[]}
        configs={roleCfgs as any[]}
        dryRunCount={dryRunOn}
      />
    </>
  );
}
