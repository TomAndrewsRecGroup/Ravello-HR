import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import ValueReportClient from './ValueReportClient';

export const metadata: Metadata = { title: 'Client Value Reports' };
export const revalidate = 60;

export default async function ValueReportsPage() {
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  // Cross-tenant rollup with no per-company filter — soft cap each
  // table at 5K rows so the page can't OOM once the dataset crosses
  // 100K. Value-reports is a portfolio overview; a date filter would
  // be cleaner long-term but this caps the scaling cliff today.
  const [
    compRes, reqRes, candRes, ticketRes, docRes, complianceRes, servReqRes, actionsRes, loginRes,
    trainingRes, reviewsRes, absenceRes, onboardingRes,
    standardsRes, clausesRes, evidenceLinksRes, legalObligationsRes, evaluationsRes, objectivesRes, auditFindingsRes,
  ] = await Promise.all([
    // monthly_retainer_pence is the real MRR source (2026-10-01,
    // replacing the dead `client_services` table — see CLAUDE.md's
    // "retire client_services" entry).
    supabase.from('companies').select('id, name, active, contact_email, monthly_retainer_pence').eq('active', true).order('name').limit(500),
    readAllPages<any>((from, to) => supabase.from('requisitions').select('id, company_id, title, stage, created_at, updated_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('candidates').select('id, company_id, full_name, client_status, created_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('tickets').select('id, company_id, subject, status, priority, created_at, resolved_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('documents').select('id, company_id, name, created_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('compliance_items').select('id, company_id, title, status, created_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('service_requests').select('id, company_id, subject, status, created_at, responded_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('actions').select('id, company_id, title, status, created_at, completed_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('profiles').select('id, company_id, role').neq('role', 'tps_admin').order('id').range(from, to)),
    // LEAD: people-management metrics, distinct from SUPPORT's
    // ticket/service-request handling — see CLAUDE.md, the naming/
    // flags sweep flagged this as the real gap, not just a label fix.
    readAllPages<any>((from, to) => supabase.from('training_needs').select('id, company_id, status, created_at, updated_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('performance_reviews').select('id, company_id, status, due_date, completed_at, created_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('absence_records').select('id, company_id, status, start_date, days, created_at').eq('status', 'approved').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('onboarding_instances').select('id, company_id, status, started_at, completed_at').order('id').range(from, to)),
    // GOVERNANCE (Core-OS 360 Phase 5, Group 8): ISO readiness, the
    // Legal Register, Objectives and Audit Findings. standards/clauses
    // are the small staff-authored catalogue (158), read once and
    // shared across every company's report client-side, same as the
    // other cross-tenant reads on this page.
    readAllPages<any>((from, to) => supabase.from('management_system_standards').select('id, code').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('standard_clauses').select('id, standard_id').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('standard_evidence_links').select('company_id, clause_id').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('organisation_legal_obligations').select('id, company_id, applicability_status').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('compliance_evaluations').select('company_id, status, evaluated_at').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('objectives').select('company_id, status').order('id').range(from, to)),
    readAllPages<any>((from, to) => supabase.from('audit_findings').select('company_id, created_at, closed_at').order('id').range(from, to)),
  ]);

  return (
    <>
      <AdminTopbar title="Client Value Reports" subtitle="Generate monthly reports showing what Core OS 360 delivered" />
      <main className="admin-page flex-1">
        <ValueReportClient
          companies={compRes.data ?? []}
          requisitions={reqRes.data ?? []}
          candidates={candRes.data ?? []}
          tickets={ticketRes.data ?? []}
          documents={docRes.data ?? []}
          complianceItems={complianceRes.data ?? []}
          serviceRequests={servReqRes.data ?? []}
          actions={actionsRes.data ?? []}
          profiles={loginRes.data ?? []}
          trainingNeeds={trainingRes.data ?? []}
          performanceReviews={reviewsRes.data ?? []}
          absenceRecords={absenceRes.data ?? []}
          onboardingInstances={onboardingRes.data ?? []}
          standards={standardsRes.data ?? []}
          standardClauses={clausesRes.data ?? []}
          standardEvidenceLinks={evidenceLinksRes.data ?? []}
          legalObligations={legalObligationsRes.data ?? []}
          complianceEvaluations={evaluationsRes.data ?? []}
          objectives={objectivesRes.data ?? []}
          auditFindings={auditFindingsRes.data ?? []}
        />
      </main>
    </>
  );
}
