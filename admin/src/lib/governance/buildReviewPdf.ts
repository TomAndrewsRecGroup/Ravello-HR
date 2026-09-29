import type { ManagementReviewDataPack } from './dataPack';

// Prints a completed (or in-progress) management review's stored data
// pack + decisions. Follows the EXACT admin/src/lib/valueReport/
// buildReportPdf.ts pattern: the jsPDF constructor and autoTable
// function are passed in as PARAMETERS, never imported at the top of
// this module, so the browser button can lazy `import()` them (keeps
// the page bundle small) while a future server-side caller could
// import them normally — see that file's own header comment for why.
//
// This PDF renders ONLY what is already stored: the data pack's own
// JSON snapshot (never recomputed here) and the decisions already on
// file. Nothing here computes or asserts anything new.

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
}

export interface ReviewPdfDecision { topic: string; decision_text: string; has_action: boolean; created_at: string }

export function buildReviewPdf(
  JsPdfCtor: new (opts: { unit: string; format: string }) => JsPdfLike,
  autoTable: (doc: JsPdfLike, opts: Record<string, unknown>) => void,
  opts: {
    companyName: string;
    reviewDate: string;
    status: string;
    chairedByName: string | null;
    attendeeNames: string[];
    pack: ManagementReviewDataPack | null;
    decisions: ReviewPdfDecision[];
  },
): JsPdfLike {
  const { companyName, reviewDate, status, chairedByName, attendeeNames, pack, decisions } = opts;

  const PURPLE   = [11, 120, 150] as [number, number, number];
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
  doc.text('Management Review Pack', 40, y + 16);
  y += 40;

  doc.setFillColor(...SURFACE);
  doc.roundedRect(40, y, W - 80, 72, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(companyName, 56, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK_SOFT);
  doc.text(`Review date: ${reviewDate}   Status: ${status}`, 56, y + 40);
  doc.text(`Chaired by: ${chairedByName ?? 'Not recorded'}   Attendees: ${attendeeNames.length > 0 ? attendeeNames.join(', ') : 'None recorded'}`, 56, y + 56);
  y += 90;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('Data pack (factual counts, recorded at generation time)', 40, y);
  y += 8;

  if (pack) {
    const rows: [string, string][] = [
      ['Open actions', String(pack.open_actions_count)],
      ['Overdue register items', String(pack.overdue_compliance_items_count)],
      [`Incidents recorded${pack.since ? ` since ${pack.since}` : ''}`, String(pack.incidents_count_since)],
      [`Environmental incidents recorded${pack.since ? ` since ${pack.since}` : ''}`, String(pack.environmental_incidents_count_since)],
      [`Audits run${pack.since ? ` since ${pack.since}` : ''}`, String(pack.audits_run_count_since)],
      ['Audits scoring below 70%', String(pack.audits_low_score_count_since)],
      ['Objectives by status', Object.entries(pack.objective_status_breakdown).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'],
      ['Legal obligations by applicability', Object.entries(pack.legal_obligation_applicability_breakdown).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'],
      ['Environmental aspects confirmed significant', String(pack.environmental_aspect_status_breakdown['confirmed_significant'] ?? 0)],
      ...pack.iso_readiness.map(r => [
        `${r.standard_name}: clauses with evidence`,
        `${r.clauses_with_evidence} of ${r.total_clauses}`,
      ] as [string, string]),
    ];
    autoTable(doc, {
      startY: y + 8,
      head: [['Metric', 'Value']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: PURPLE, textColor: [255, 255, 255] },
      margin: { left: 40, right: 40 },
    });
    y = (doc.lastAutoTable?.finalY ?? y + 8) + 24;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK_SOFT);
    doc.text('No data pack has been generated for this review yet.', 40, y + 16);
    y += 32;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('Decisions', 40, y);

  if (decisions.length > 0) {
    autoTable(doc, {
      startY: y + 8,
      head: [['Topic', 'Decision', 'Action raised']],
      body: decisions.map(d => [d.topic, d.decision_text, d.has_action ? 'Yes' : 'No']),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: PURPLE, textColor: [255, 255, 255] },
      margin: { left: 40, right: 40 },
      columnStyles: { 1: { cellWidth: 260 } },
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK_SOFT);
    doc.text('No decisions recorded yet.', 40, y + 16);
  }

  return doc;
}
