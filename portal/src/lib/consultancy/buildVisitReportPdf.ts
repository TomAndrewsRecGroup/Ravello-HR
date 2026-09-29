import { VISIT_TYPE_LABELS, OBSERVATION_TYPE_LABELS, OBSERVATION_SEVERITY_LABELS } from './vocab';
import type { VisitType, ObservationType, ObservationSeverity } from './vocab';

// Mirrors admin's own buildReportPdf.ts JsPdfLike shape exactly — kept
// as a separate, portal-local copy rather than a cross-app import
// (the two Next.js apps do not import from one another).
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

// Core-OS 360 Phase 7, Group 5. Mirrors admin's buildReportPdf.ts
// parameter-injection shape exactly: jsPDF + autoTable are passed in,
// never imported at the top of this module, so the same builder serves
// both the portal's own lazy browser preview (small bundle) and the
// issue route (Node runtime, imports normally).
//
// The findings table is built from visit_observations rows passed in
// by the caller — this file computes NOTHING from the database itself
// and holds no client-visibility filter of its own; the caller (the
// issue route) is responsible for having already selected only
// client_visible = true rows, the same "nothing here is self-
// certified, internal stays internal" rule those rows already carry.
// Evidence photos are noted by count, never embedded — attaching an
// image to a jsPDF page is materially more complex and out of scope
// here; a reader opens the portal to see the photo itself.

export interface VisitReportObservationRow {
  observation_type: ObservationType;
  severity: ObservationSeverity | null;
  location_section: string | null;
  description: string;
  evidenceCount: number;
}

export interface VisitReportPdfData {
  clientName: string;
  visitType: VisitType;
  visitDate: string;
  consultantName: string | null;
  summary: string | null;
  recommendations: string | null;
  nextVisitRecommendedDate: string | null;
  version: number;
  observations: VisitReportObservationRow[];
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function buildVisitReportPdf(
  JsPdfCtor: new (opts: { unit: string; format: string }) => JsPdfLike,
  autoTable: (doc: JsPdfLike, opts: Record<string, unknown>) => void,
  opts: { generatedAt: Date; data: VisitReportPdfData },
): JsPdfLike {
  const { generatedAt, data: r } = opts;

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
  doc.text(`Site Visit Report${r.version > 1 ? ` (revision ${r.version})` : ''}`, 40, y + 16);
  y += 40;

  doc.setFillColor(...SURFACE);
  doc.roundedRect(40, y, W - 80, 76, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(r.clientName, 56, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK_SOFT);
  doc.text(`${VISIT_TYPE_LABELS[r.visitType]} — ${fmtDate(r.visitDate)}${r.consultantName ? ` — ${r.consultantName}` : ''}`, 56, y + 42);
  doc.text(`Generated: ${generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 56, y + 58);
  y += 96;

  function heading(title: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PURPLE);
    doc.text(title, 40, y);
    y += 14;
  }

  function paragraph(text: string) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize ? doc.splitTextToSize(text, W - 80) : [text];
    for (const line of lines) { doc.text(line, 40, y); y += 14; }
    y += 10;
  }

  if (r.summary) { heading('Summary'); paragraph(r.summary); }

  heading(`Observations (${r.observations.length})`);
  autoTable(doc, {
    startY: y,
    head: [['Type', 'Severity', 'Location', 'Description', 'Evidence']],
    body: r.observations.map(o => [
      OBSERVATION_TYPE_LABELS[o.observation_type],
      o.severity ? OBSERVATION_SEVERITY_LABELS[o.severity] : '—',
      o.location_section ?? '—',
      o.description,
      o.evidenceCount > 0 ? `${o.evidenceCount} photo${o.evidenceCount === 1 ? '' : 's'}` : '—',
    ]),
    theme: 'plain',
    styles: { fontSize: 9, textColor: INK, cellPadding: 6, overflow: 'linebreak' },
    headStyles: { fillColor: SURFACE, textColor: INK_SOFT, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 3: { cellWidth: 200 } },
    margin: { left: 40, right: 40 },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 24;

  if (r.recommendations) { heading('Recommendations'); paragraph(r.recommendations); }
  if (r.nextVisitRecommendedDate) { heading('Next visit recommended'); paragraph(fmtDate(r.nextVisitRecommendedDate)); }

  return doc;
}
