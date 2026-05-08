'use client';
import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-secondary btn-sm no-print"
      title="Use your browser's Save as PDF in the print dialog"
    >
      <Printer size={12} /> Download PDF
    </button>
  );
}
