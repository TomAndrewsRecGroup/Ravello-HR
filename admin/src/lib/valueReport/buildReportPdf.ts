import type { ValueReportData } from './computeReport';

// Builds the Client Value Report PDF. Takes the jsPDF constructor and
// autoTable function as PARAMETERS rather than importing them at the
// top of this module, so the same builder works from both call sites
// without forcing either one's import strategy on the other:
//   - the browser download button lazy `import()`s them (keeps the
//     page bundle small — jsPDF + autotable are ~150kB gzipped);
//   - the monthly auto-generation cron (Node, no bundle-size concern)
//     imports them normally at the top of its route file.
// Whichever caller passes them in, the rendered PDF is byte-identical
// for the same report data.

export interface JsPdfLike {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setFillColor(...rgb: [number, number, number]): void;
  setFont(name: string, style: string): void;
  setFontSize(n: number): void;
  setTextColor(...rgb: [number, number, number]): void;
  rect(x: number, y: number, w: number, h: number, style: string): void;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style: string): void;
  text(text: string, x: number, y: number, opts?: { align?: string }): void;
  setPage(n: number): void;
  getNumberOfPages?(): number;
  lastAutoTable?: { finalY: number };
  splitTextToSize?(text: string, maxWidth: number): string[];
  addPage?(): void;
}

export function buildReportPdf(
  JsPdfCtor: new (opts: { unit: string; format: string }) => JsPdfLike,
  autoTable: (doc: JsPdfLike, opts: Record<string, unknown>) => void,
  opts: { companyName: string; month: string; generatedAt: Date; data: ValueReportData; narrative?: string | null },
): JsPdfLike {
  const { companyName, month, generatedAt, data: r, narrative } = opts;

  const PURPLE   = [11, 120, 150] as [number, number, number]; // Core OS 360 accent (#0B7896)
  const INK      = [7, 11, 29]    as [number, number, number];
  const INK_SOFT = [56, 67, 106]  as [number, number, number];
  const SURFACE  = [244, 245, 251] as [number, number, number];

  const doc = new JsPdfCtor({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 56;

  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, W, 12, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('Core OS 360', 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK_SOFT);
  doc.text('Client Value Report', 40, y + 16);
  y += 40;

  doc.setFillColor(...SURFACE);
  doc.roundedRect(40, y, W - 80, 64, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(companyName, 56, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK_SOFT);
  doc.text(`Period: ${month}`, 56, y + 40);
  doc.text(`Generated: ${generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 56, y + 56);
  y += 90;

  function section(title: string, rows: [string, string | number][]) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PURPLE);
    doc.text(title, 40, y);
    y += 6;
    autoTable(doc, {
      startY:       y + 4,
      head:         [['Metric', 'Value']],
      body:         rows.map(([k, v]) => [k, String(v)]),
      theme:        'plain',
      styles:       { fontSize: 10, textColor: INK, cellPadding: 6 },
      headStyles:   { fillColor: SURFACE, textColor: INK_SOFT, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 280 }, 1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' } },
      margin:       { left: 40, right: 40 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 18;
  }

  section('HIRE', [
    ['New roles raised',           r.hire.newRoles],
    ['Roles filled this month',    r.hire.filled],
    ['Candidates submitted',       r.hire.candidates],
    ['Active roles (current)',     r.hire.activeRoles],
    ['Total roles filled all-time', r.hire.totalFilled],
  ]);

  section('SUPPORT', [
    ['Service requests',           r.support.serviceRequests],
    ['Service requests responded', r.support.serviceRequestsResponded],
    ['Avg response time (hours)',  r.support.avgResponseHours],
  ]);

  section('PROTECT', [
    ['Compliance items addressed', r.protect.complianceItems],
    ['Documents uploaded',         r.protect.documentsUploaded],
    ['Actions created',            r.protect.actionsCreated],
    ['Actions completed',          r.protect.actionsCompleted],
  ]);

  section('LEAD', [
    ['Training needs flagged',     r.lead.trainingNeedsFlagged],
    ['Training needs resolved',    r.lead.trainingNeedsResolved],
    ['Training needs open (current)', r.lead.trainingNeedsOpen],
    ['Reviews due',                r.lead.reviewsDue],
    ['Reviews completed',          r.lead.reviewsCompleted],
    ['Reviews overdue (current)',  r.lead.reviewsOverdue],
    ['Absence days recorded',      r.lead.absenceDays],
    ['Onboarding started',         r.lead.onboardingStarted],
    ['Onboarding completed',       r.lead.onboardingCompleted],
  ]);

  // Core-OS 360 Phase 5, Group 8. ISO readiness is reported per
  // standard as counts only ("3 of 12 clauses have recorded evidence"),
  // never a percentage or a certification claim — the standalone
  // readiness dashboard's own posture (158).
  section('GOVERNANCE', [
    ...r.governance.isoReadiness.map(
      s => [`ISO readiness — ${s.standardCode}`, `${s.clausesWithEvidence} of ${s.clausesTotal} clauses have recorded evidence`] as [string, string],
    ),
    ['Legal obligations recorded applicable', r.governance.legalObligationsApplicable],
    ['Legal evaluations this month',          r.governance.legalEvaluationsThisMonth],
    ['Evaluations flagging non-compliance',   r.governance.legalEvaluationsNonComplianceThisMonth],
    ['Objectives tracked (current)',          r.governance.objectivesTotal],
    ['Objectives on track or achieved (current)', r.governance.objectivesOnTrack],
    ['Audit findings opened this month',      r.governance.auditFindingsOpenedThisMonth],
    ['Audit findings closed this month',      r.governance.auditFindingsClosedThisMonth],
    ['Audit findings open (current)',         r.governance.auditFindingsOpen],
  ]);

  section('SYSTEM USAGE', [
    ['Portal users',     r.usage.portalUsers],
    ['Monthly fee',      `£${r.usage.mrr}`],
  ]);

  // Core-OS 360 Phase 6, section 10: optional consultant commentary.
  // Free text, never computed — rendered only when present, as its
  // own section after every deterministic metric table, so a reader
  // never confuses the person's own words with a computed number.
  if (narrative && narrative.trim().length > 0) {
    const H = doc.internal.pageSize.getHeight();
    if (y > H - 120 && doc.addPage) {
      doc.addPage();
      y = 56;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PURPLE);
    doc.text('CONSULTANT NOTES', 40, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize ? doc.splitTextToSize(narrative, W - 80) : [narrative];
    for (const line of lines) {
      if (y > H - 60 && doc.addPage) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, 40, y);
      y += 14;
    }
    y += 10;
  }

  const pageCount = doc.getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK_SOFT);
    doc.text('thepeoplesystem.co.uk', 40, H - 24);
    doc.text(`Page ${i} of ${pageCount}`, W - 40, H - 24, { align: 'right' });
  }

  return doc;
}
