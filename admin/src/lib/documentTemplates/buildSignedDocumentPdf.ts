// The final PDF for a generated HR document — either on signing (the
// public /sign/[token] route) or, for a template with no signature
// requirement, the moment it is sent. jsPDF's constructor is a
// PARAMETER, never imported at the top of this module — the exact
// lib/valueReport/buildReportPdf.ts precedent: the browser bundle
// lazy-`import()`s it, a Node route imports it normally, and this
// pure module stays usable from either without pulling the library
// into every caller's bundle.

export interface SignedDocumentPdfData {
  title: string;
  body: string;
  signedByName: string | null;
  signedAt: string | null;
  signedIp: string | null;
  requiresSignature: boolean;
}

/** `JsPDF` is the jspdf constructor (`import jsPDF from 'jspdf'`). */
export function buildSignedDocumentPdf(JsPDF: any, data: SignedDocumentPdfData) {
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function addLine(text: string, size: number, bold = false) {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += size * 1.4;
    }
  }

  addLine(data.title, 14, true);
  y += 10;
  for (const paragraph of data.body.split('\n')) {
    if (paragraph.trim() === '') { y += 10; continue; }
    addLine(paragraph, 10);
  }

  y += 20;
  if (y > pageHeight - margin - 60) { doc.addPage(); y = margin; }
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  addLine('ELECTRONIC SIGNATURE RECORD', 9, true);
  if (data.requiresSignature && data.signedByName) {
    addLine(`Signed by: ${data.signedByName}`, 9);
    addLine(`Signed at: ${data.signedAt ? new Date(data.signedAt).toLocaleString('en-GB') : '—'}`, 9);
    if (data.signedIp) addLine(`IP address: ${data.signedIp}`, 9);
    addLine(
      'This is a simple electronic signature under section 7 of the Electronic Communications Act 2000, not a qualified or advanced electronic signature.',
      8,
    );
  } else {
    addLine('No signature was required for this document.', 9);
  }

  return doc;
}
