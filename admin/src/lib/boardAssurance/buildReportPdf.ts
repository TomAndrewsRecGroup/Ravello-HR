import type { BoardAssuranceReportData } from './computeReport';

// Same parameterised-builder pattern as lib/valueReport/buildReportPdf.ts:
// jsPDF and autoTable are passed in by the caller rather than imported
// here, so the ONE builder serves a browser download button (lazy
// import to keep the page bundle small) and, if a future group ever
// needs it, a server cron with no bundle-size concern at all.

const BAND_LABEL: Record<string, string> = { red: 'Needs attention', amber: 'Worth a look', green: 'On track' };

export function buildBoardAssuranceReportPdf(
  jsPDFCtor: new (...args: unknown[]) => any,
  autoTable: (doc: unknown, opts: unknown) => void,
  input: { companyName: string; data: BoardAssuranceReportData },
): any {
  const { companyName, data } = input;
  const doc = new jsPDFCtor();

  doc.setFontSize(16);
  doc.text(`Board Assurance Report — Q${data.quarter} ${data.year}`, 14, 18);
  doc.setFontSize(11);
  doc.text(companyName, 14, 26);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date(data.generatedAt).toLocaleDateString('en-GB')}`, 14, 32);

  doc.setFontSize(12);
  doc.text(`Overall: ${BAND_LABEL[data.overallBand] ?? data.overallBand}`, 14, 42);
  if (data.trend && data.priorPeriod) {
    doc.setFontSize(9);
    doc.text(
      `Trend vs. Q${data.priorPeriod.quarter} ${data.priorPeriod.year}: ${data.trend}`,
      14, 48,
    );
  }

  autoTable(doc, {
    startY: 54,
    head: [['Area', 'Status', 'Notes']],
    body: data.complianceTwin.areas.map(a => [a.label, BAND_LABEL[a.band] ?? a.band, a.reasons.join('; ')]),
    styles: { fontSize: 8, cellWidth: 'wrap' },
    columnStyles: { 2: { cellWidth: 100 } },
  });

  const afterAreas = (doc as any).lastAutoTable?.finalY ?? 100;
  autoTable(doc, {
    startY: afterAreas + 8,
    head: [['Portfolio metric', 'Count']],
    body: [
      ['Open critical actions', data.portfolioCounts.open_critical_actions],
      ['Overdue legal evaluations', data.portfolioCounts.overdue_legal_evaluations],
      ['Overdue controlled documents', data.portfolioCounts.overdue_controlled_documents],
      ['Open incident investigations', data.portfolioCounts.open_incident_investigations],
      ['Safety-critical gaps', data.portfolioCounts.safety_critical_gaps],
      ['Workers not ready', data.portfolioCounts.workers_not_ready],
      ['Assets unavailable', data.portfolioCounts.assets_unavailable],
      ['Major audit findings', data.portfolioCounts.major_audit_findings],
      ['Contractors needing attention', data.portfolioCounts.contractor_expiring],
      ['Environmental permits expiring', data.portfolioCounts.environmental_permits_expiring],
      ['Management reviews due', data.portfolioCounts.management_reviews_due],
      ['Outstanding service requests', data.portfolioCounts.outstanding_service_requests],
    ].map(([label, count]) => [String(label), String(count)]),
    styles: { fontSize: 8 },
  });

  const afterCounts = (doc as any).lastAutoTable?.finalY ?? 150;
  doc.setFontSize(11);
  doc.text('Latest management review', 14, afterCounts + 10);
  doc.setFontSize(9);
  if (!data.latestManagementReview) {
    doc.text('No completed management review on record yet.', 14, afterCounts + 16);
  } else {
    doc.text(`Reviewed ${new Date(data.latestManagementReview.reviewDate).toLocaleDateString('en-GB')}`, 14, afterCounts + 16);
    autoTable(doc, {
      startY: afterCounts + 20,
      head: [['Topic', 'Decision']],
      body: data.latestManagementReview.decisions.map(d => [d.topic, d.decisionText]),
      styles: { fontSize: 8, cellWidth: 'wrap' },
      columnStyles: { 1: { cellWidth: 120 } },
    });
  }

  return doc;
}
