import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { readAllPages } from '@/lib/supabase/paged';
import { computeBand, computeEngagementScore } from '@/lib/health/scoring';
import { computePortfolioCounts } from '@/lib/health/portfolioCounts';

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
      companiesRes, complianceRes, stalledReqsRes,
      profilesPage, reqsPage, serviceRequestsAllPage, docsRes,
      actionsPage, legalObligationsPage, docsReviewDuePage, incidentsPage,
      deploymentStatusPage, equipmentPage, auditFindingsPage, contractorsPage,
      contractorInsurancesPage, environmentalPermitsPage, managementReviewsPage,
      consultancyVisitsPage,
    ] = await Promise.all([
      sb.from('companies').select('id, active, last_portal_login, login_count_30d'),
      sb.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'complete'),
      sb.from('requisitions').select('company_id,updated_at,stage').not('stage', 'in', '(filled,cancelled)').lt('updated_at', fortnightAgo),
      readAllPages<{ company_id: string }>((from, to) => sb.from('profiles').select('company_id').neq('role', 'tps_admin').order('id').range(from, to)),
      readAllPages<{ company_id: string; stage: string; created_at: string }>((from, to) => sb.from('requisitions').select('company_id, stage, created_at').order('id').range(from, to)),
      // tickets/ticket_messages were retired as the support object (see
      // "Support & BD in sync" in CLAUDE.md) — service_requests is the
      // live one. This used to read the now-permanently-empty tickets
      // table for band/engagement_score via a separate, unpaged query,
      // so every client's support load had silently scored zero since
      // that migration. ONE paged read now feeds band/engagement_score
      // (open count, recency) AND computePortfolioCounts below — it
      // used to be two separate reads of this same table.
      readAllPages<{ company_id: string; status: string; created_at: string }>((from, to) => sb.from('service_requests').select('company_id, status, created_at').order('id').range(from, to)),
      sb.from('documents').select('company_id'),
      // Phase 6 section 2: the factual portfolio counts. Every one of
      // these is paged (never a bare .select()) — a consultancy with a
      // large portfolio is exactly the shape that would silently clip
      // at PostgREST's 1,000-row cap otherwise.
      readAllPages<{ company_id: string; status: string; severity: string | null }>(
        (from, to) => sb.from('actions').select('company_id, status, severity').order('id').range(from, to)),
      readAllPages<{ company_id: string; applicability_status: string; next_review_due: string | null }>(
        (from, to) => sb.from('organisation_legal_obligations').select('company_id, applicability_status, next_review_due').order('id').range(from, to)),
      readAllPages<{ company_id: string }>(
        (from, to) => sb.from('hs_documents').select('company_id').eq('status', 'review_due').order('id').range(from, to)),
      readAllPages<{ company_id: string; status: string; severity: string | null }>(
        (from, to) => sb.from('hs_incidents').select('company_id, status, severity').order('id').range(from, to)),
      readAllPages<{ company_id: string; status: string; result: any }>(
        (from, to) => sb.from('person_deployment_status').select('company_id, status, result').order('person_id').range(from, to)),
      readAllPages<{ company_id: string; status: string }>(
        (from, to) => sb.from('hs_equipment').select('company_id, status').order('id').range(from, to)),
      readAllPages<{ company_id: string; severity: string; closed_at: string | null }>(
        (from, to) => sb.from('audit_findings').select('company_id, severity, closed_at').order('id').range(from, to)),
      readAllPages<{ id: string; company_id: string; approval_status: string }>(
        (from, to) => sb.from('contractors').select('id, company_id, approval_status').order('id').range(from, to)),
      readAllPages<{ contractor_id: string; expires_on: string | null }>(
        (from, to) => sb.from('contractor_insurances').select('contractor_id, expires_on').order('id').range(from, to)),
      readAllPages<{ company_id: string; status: string; expires_on: string | null }>(
        (from, to) => sb.from('environmental_permits').select('company_id, status, expires_on').order('id').range(from, to)),
      readAllPages<{ company_id: string; status: string; review_date: string | null }>(
        (from, to) => sb.from('management_reviews').select('company_id, status, review_date').order('id').range(from, to)),
      readAllPages<{ client_organisation_id: string; status: string; scheduled_date: string }>(
        (from, to) => sb.from('consultancy_visits').select('client_organisation_id, status, scheduled_date').order('id').range(from, to)),
    ]);

    const companies = companiesRes.data ?? [];
    if (companiesRes.error) throw new Error(`companies: ${companiesRes.error.message}`);

    const countBy = (rows: { company_id: string }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1);
      return m;
    };
    const overdueByCompany = countBy((complianceRes.data ?? []) as { company_id: string }[]);
    const ticketsByCompany = countBy(serviceRequestsAllPage.rows.filter((s) => s.status === 'new' || s.status === 'in_progress'));
    const stalledByCompany = countBy((stalledReqsRes.data ?? []) as { company_id: string }[]);

    const userCountMap = countBy(profilesPage.rows);
    const activeRolesMap = new Map<string, number>();
    const recentReqsMap = new Map<string, number>();
    for (const r of reqsPage.rows) {
      if (!['filled', 'cancelled'].includes(r.stage)) activeRolesMap.set(r.company_id, (activeRolesMap.get(r.company_id) ?? 0) + 1);
      if (new Date(r.created_at).getTime() > thirtyDaysAgo) recentReqsMap.set(r.company_id, (recentReqsMap.get(r.company_id) ?? 0) + 1);
    }
    const recentTicketsMap = new Map<string, number>();
    for (const t of serviceRequestsAllPage.rows) {
      if (new Date(t.created_at).getTime() > thirtyDaysAgo) recentTicketsMap.set(t.company_id, (recentTicketsMap.get(t.company_id) ?? 0) + 1);
    }
    const docCountMap = countBy((docsRes.data ?? []) as { company_id: string }[]);

    const portfolioCounts = computePortfolioCounts(
      companies.map((c: any) => c.id),
      now,
      {
        actions: actionsPage.rows,
        legalObligations: legalObligationsPage.rows,
        documentsReviewDue: docsReviewDuePage.rows,
        incidents: incidentsPage.rows,
        deploymentStatus: deploymentStatusPage.rows,
        equipment: equipmentPage.rows,
        auditFindings: auditFindingsPage.rows,
        contractors: contractorsPage.rows,
        contractorInsurances: contractorInsurancesPage.rows,
        environmentalPermits: environmentalPermitsPage.rows,
        managementReviews: managementReviewsPage.rows,
        serviceRequests: serviceRequestsAllPage.rows,
        consultancyVisits: consultancyVisitsPage.rows,
      },
    );

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

      const portfolio = portfolioCounts.get(c.id)!;

      return {
        company_id: c.id, snapshot_date: today, band, engagement_score,
        overdue_comp, open_tickets, stalled_reqs,
        days_since_login: lastLogin > 0 ? daysSinceLogin : null,
        ...portfolio,
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
