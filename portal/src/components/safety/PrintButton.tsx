'use client';
import { Printer } from 'lucide-react';
export default function PrintButton() {
  return (
    <button type="button" className="btn-secondary btn-sm print:hidden" onClick={() => window.print()}>
      <Printer size={14} /> Print or save as PDF
    </button>
  );
}
