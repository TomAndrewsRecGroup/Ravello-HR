import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { readAllPages } from '@/lib/supabase/paged';
import { computeBand, computeEngagementScore } from '@/lib/health/scoring';

// Daily (06:45 UTC, after reminders at 06:00 and before the weekly
// summary window): one client_health_snapshots row per active company
// per day. Computes EXACTLY what /health (band) and /engagement
// (score) already show, via the shared pure functions in
// lib/health/scoring.ts — the whole point of the daily row is a trend
// line, so drifting from what the live pages say would make the trend
// meaningless.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'health-snapshot', async (sb) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const fortnightAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;

    const [
      companiesRes, complianceRes, ticketsRes, stalledReqsRes,
      profilesPage, reqsPage, ticketsAllPage, docsRes,
    ] = await Promise.all([
      sb.from('companies').select('id, active, last_portal_login, login_count_30d'),
      sb.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'complete'),
      sb.from('tickets').select('company_id').in('status', ['open', 'in_progress']),
      sb.from('requisitions').select('company_id,updated_at,stage').not('stage', 'in', '(filled,cancelled)').lt('updated_at', fortnightAgo),
      readAllPages<{ company_id: string }>((from, to) => sb.from('profiles').select('company_id').neq('role', 'tps_admin').order('id').range(from, to)),
      readAllPages<{ company_id: string; stage: string; created_at: string }>((from, to) => sb.from('requisitions').select('company_id, stage, created_at').order('id').range(from, to)),
      readAllPages<{ company_id: string; status: string; created_at: string }>((from, to) => sb.from('tickets').select('company_id, status, created_at').order('id').range(from, to)),
      sb.from('documents').select('company_id'),
    ]);

    const companies = companiesRes.data ?? [];
    if (companiesRes.error) throw new Error(`companies: ${companiesRes.error.message}`);

    const countBy = (rows: { company_id: string }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1);
      return m;
    };
    const overdueByCompany = countBy((complianceRes.data ?? []) as { company_id: string }[]);
    const ticketsByCompany = countBy((ticketsRes.data ?? []) as { company_id: string }[]);
    const stalledByCompany = countBy((stalledReqsRes.data ?? []) as { company_id: string }[]);

    const userCountMap = countBy(profilesPage.rows);
    const activeRolesMap = new Map<string, number>();
    const recentReqsMap = new Map<string, number>();
    for (const r of reqsPage.rows) {
      if (!['filled', 'cancelled'].includes(r.stage)) activeRolesMap.set(r.company_id, (activeRolesMap.get(r.company_id) ?? 0) + 1);
      if (new Date(r.created_at).getTime() > thirtyDaysAgo) recentReqsMap.set(r.company_id, (recentReqsMap.get(r.company_id) ?? 0) + 1);
    }
    const recentTicketsMap = new Map<string, number>();
    for (const t of ticketsAllPage.rows) {
      if (new Date(t.created_at).getTime() > thirtyDaysAgo) recentTicketsMap.set(t.company_id, (recentTicketsMap.get(t.company_id) ?? 0) + 1);
    }
    const docCountMap = countBy((docsRes.data ?? []) as { company_id: string }[]);

    const rows = companies.map((c: any) => {
      const overdue_comp = overdueByCompany.get(c.id) ?? 0;
      const open_tickets = ticketsByCompany.get(c.id) ?? 0;
      const stalled_reqs = stalledByCompany.get(c.id) ?? 0;
      const band = computeBand({ active: c.active, overdue_comp, open_tickets, stalled_reqs });

      const lastLogin = c.last_portal_login ? new Date(c.last_portal_login).getTime() : 0;
      const daysSinceLogin = lastLogin > 0 ? Math.floor((now.getTime() - lastLogin) / 86_400_000) : 999;
      const engagement_score = computeEngagementScore({
        daysSinceLogin,
        activeRoles: activeRolesMap.get(c.id) ?? 0,
        recentReqs: recentReqsMap.get(c.id) ?? 0,
        recentTickets: recentTicketsMap.get(c.id) ?? 0,
        docCount: docCountMap.get(c.id) ?? 0,
        loginCount30d: c.login_count_30d ?? 0,
      });

      return {
        company_id: c.id, snapshot_date: today, band, engagement_score,
        overdue_comp, open_tickets, stalled_reqs,
        days_since_login: lastLogin > 0 ? daysSinceLogin : null,
      };
    });

    if (rows.length === 0) return { tally: { companies: 0 }, degraded: false };

    // One row per company per day: re-running the same day overwrites
    // that day's row rather than erroring or duplicating.
    const { error, count } = await sb.from('client_health_snapshots')
      .upsert(rows, { onConflict: 'company_id,snapshot_date', count: 'exact' });

    const tally = { companies: companies.length, written: count ?? rows.length };
    if (error) return { tally, degraded: true, error: error.message };
    return { tally, degraded: false };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
