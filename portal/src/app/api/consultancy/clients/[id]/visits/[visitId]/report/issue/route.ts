import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { buildVisitReportPdf } from '@/lib/consultancy/buildVisitReportPdf';
import { sendEmail } from '@/lib/email';
import type { ConsultancyVisit, ConsultancyVisitReport, VisitObservation } from '@/lib/consultancy/types';

// This route lives IN the portal app, but the link still needs to be
// an ABSOLUTE url for an email — a relative path means nothing outside
// a browser tab already on this origin. Same canonical fallback admin's
// own portalUrl() uses for the identical reason.
function reportsPageUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk').trim().replace(/\/+$/, '');
  return `${raw}/protect/reports`;
}

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/consultancy/clients/[id]/visits/[visitId]/report/issue
//
// Core-OS 360 Phase 7, Group 5, hardened in Group 8. The ONE controlled
// entry point that issues a visit report: generates the PDF (jsPDF +
// autoTable, Node runtime, imported normally — the same
// buildVisitReportPdf shape admin's monthly value-report cron already
// uses for buildReportPdf), uploads it, records it in the existing
// `reports` table (which gets the Service Ledger entry for free —
// ledger_report_generated already fires on reports.created), advances
// the visit's own lifecycle, and emails the client — all under the
// service role this route already holds, synchronously, the same "a
// controlled entry point calls notify()/sends directly, no async
// consumer needed" precedent the H&S Tests public-token route already
// established.
//
// CLAIM FIRST, work second (Group 8 adversarial-QA finding). The
// original version generated the PDF, uploaded it and inserted the
// `reports` row BEFORE the conditional status-flip that actually
// guarded against a double-submit — a genuine double-click, or two
// tabs open on the same draft, would have produced two uploaded PDFs
// and two `reports` rows (each with its own Service Ledger entry, keyed
// on the reports row's own id) before the SECOND request's status-flip
// finally lost the race and only THEN reported 409. The claim now
// happens first: only one concurrent request can ever match
// status='draft', so the loser is refused before anything is
// generated, uploaded or recorded. A failure anywhere after the claim
// reverts it (status back to 'draft') rather than leaving the report
// stuck 'issued' with no file — the same "claim, do work, compensate
// on failure" shape, applied here because storage_path cannot be known
// until after the PDF actually exists.
//
// Findings are read fresh here, client_visible = true only — never
// duplicated onto the report row itself (migration 176's own rule).
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string; visitId: string }> }) {
  const { id, visitId } = await props.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(visitId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const portfolio = await requirePortfolioSession();
  if (!portfolio) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!portfolioIncludes(portfolio.organisations, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sb = createServiceSupabaseClient();

  const { data: visit } = await sb.from('consultancy_visits').select('*').eq('id', visitId).maybeSingle();
  if (!visit || (visit as ConsultancyVisit).client_organisation_id !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const v = visit as ConsultancyVisit;

  const { data: report } = await sb.from('consultancy_visit_reports')
    .select('*').eq('visit_id', visitId).eq('status', 'draft').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!report) return NextResponse.json({ error: 'No draft report to issue for this visit' }, { status: 400 });
  const draft = report as ConsultancyVisitReport;

  const { error: claimErr, count: claimCount } = await sb.from('consultancy_visit_reports')
    .update({ status: 'issued', issued_at: new Date().toISOString(), issued_by: portfolio.session.userId }, { count: 'exact' })
    .eq('id', draft.id).eq('status', 'draft');
  if (claimErr || claimCount === 0) {
    return NextResponse.json({ error: claimErr?.message ?? 'The draft was already issued or changed — refresh and try again' }, { status: 409 });
  }

  try {
    const [{ data: company }, { data: observations }, { data: consultantProfile }] = await Promise.all([
      sb.from('companies').select('id, name, contact_email').eq('id', id).maybeSingle(),
      sb.from('visit_observations').select('id, observation_type, severity, location_section, description')
        .eq('visit_id', visitId).eq('client_visible', true).order('created_at', { ascending: true }),
      sb.from('profiles').select('full_name, email').eq('id', portfolio.session.userId).maybeSingle(),
    ]);
    if (!company) throw new Error('Client not found');

    const obsRows = (observations ?? []) as Pick<VisitObservation, 'id' | 'observation_type' | 'severity' | 'location_section' | 'description'>[];
    let evidenceCounts: Record<string, number> = {};
    if (obsRows.length > 0) {
      const { data: files } = await sb.from('hs_files').select('entity_id')
        .eq('entity_type', 'visit_observation').in('entity_id', obsRows.map(o => o.id));
      evidenceCounts = (files ?? []).reduce((acc: Record<string, number>, f: { entity_id: string }) => {
        acc[f.entity_id] = (acc[f.entity_id] ?? 0) + 1;
        return acc;
      }, {});
    }

    const consultant = consultantProfile as { full_name: string | null; email: string | null } | null;
    const doc = buildVisitReportPdf(jsPDF as any, autoTable as any, {
      generatedAt: new Date(),
      data: {
        clientName: company.name,
        visitType: v.visit_type,
        visitDate: v.scheduled_date,
        consultantName: consultant?.full_name ?? consultant?.email ?? null,
        summary: draft.summary,
        recommendations: draft.recommendations,
        nextVisitRecommendedDate: draft.next_visit_recommended_date,
        version: draft.version,
        observations: obsRows.map(o => ({
          observation_type: o.observation_type, severity: o.severity, location_section: o.location_section,
          description: o.description, evidenceCount: evidenceCounts[o.id] ?? 0,
        })),
      },
    });
    const bytes = (doc as any).output('arraybuffer') as ArrayBuffer;

    const safeName = company.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    const path = `reports/${id}/${Date.now()}_visit-report-${visitId}-v${draft.version}-${safeName}.pdf`;

    const { error: uploadErr } = await sb.storage.from('documents').upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false });
    if (uploadErr) throw new Error(`Could not upload the report: ${uploadErr.message}`);

    const { error: reportsErr } = await sb.from('reports').insert({
      company_id: id,
      title: `Site visit report — ${new Date(v.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      storage_path: path, file_url: null, generated_by: portfolio.session.userId,
    });
    if (reportsErr) throw new Error(`Report generated but could not be recorded: ${reportsErr.message}`);

    const { error: pathErr, count: pathCount } = await sb.from('consultancy_visit_reports')
      .update({ storage_path: path }, { count: 'exact' }).eq('id', draft.id);
    if (pathErr || pathCount === 0) throw new Error(pathErr?.message ?? 'Report issued but the file could not be linked');

    if (v.status === 'awaiting_report' || v.status === 'report_draft') {
      // Best-effort forward transition: the report itself is already
      // issued regardless of whether this succeeds, so a failure here is
      // logged, not surfaced as a request failure — but still counted,
      // never a blind write.
      const { error: statusErr, count: statusCount } = await sb.from('consultancy_visits')
        .update({ status: 'report_issued' }, { count: 'exact' }).eq('id', visitId);
      if (statusErr || statusCount === 0) {
        console.error('[visit-report-issue] could not advance visit status to report_issued', { visitId, error: statusErr?.message });
      }
    }

    const reportsUrl = reportsPageUrl();
    if (company.contact_email) {
      const dedupeKey = `visit-report:${visitId}:${draft.version}`;
      const { error: emailClaimErr } = await sb.from('email_log').insert({
        target_type: 'company', target_id: id, company_id: id, to_email: company.contact_email,
        subject: 'Your site visit report is ready', body_html: '', sender_kind: 'system',
        sender_email: process.env.EMAIL_FROM ?? 'noreply@portal.thepeoplesystem.co.uk',
        sent_at: new Date().toISOString(), dedupe_key: dedupeKey,
      });
      if (!emailClaimErr) {
        const html = `<p>Hello,</p><p>A site visit report for <strong>${company.name}</strong> is now available in your portal.</p><p><a href="${reportsUrl}">View your reports</a></p>`;
        await sendEmail({ to: company.contact_email, subject: 'Your site visit report is ready', html, tag: 'consultancy-visit-report' });
      }
      // A claim conflict (already sent for this dedupe key) is expected on a
      // rare double-submit and is not an error — the report is still issued.
    }

    return NextResponse.json({ ok: true, storagePath: path });
  } catch (err) {
    // Revert the claim: a report stuck 'issued' with no file would be
    // worse than the double-submit this claim exists to prevent — the
    // consultant sees the error and can simply try again. Best-effort:
    // if the revert itself fails there is nothing more useful to do
    // than log it and still report the original error to the caller.
    const { error: revertErr, count: revertCount } = await sb.from('consultancy_visit_reports')
      .update({ status: 'draft', issued_at: null, issued_by: null }, { count: 'exact' }).eq('id', draft.id).eq('status', 'issued');
    if (revertErr || revertCount === 0) {
      console.error('[visit-report-issue] could not revert a failed claim', { reportId: draft.id, error: revertErr?.message });
    }
    const message = err instanceof Error ? err.message : 'Could not issue the report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
