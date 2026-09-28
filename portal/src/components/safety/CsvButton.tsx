'use client';
import { Download } from 'lucide-react';

// CSV of exactly the rows on screen (already filtered, already
// permission-checked by RLS on the server). Values are quoted and
// formula-leading characters neutralised, so a cell that starts with
// "=" cannot run in a spreadsheet.
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(r[c.key])).join(','))].join('\r\n');
}

export default function CsvButton({ filename, columns, rows }: {
  filename: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[];
}) {
  function download() {
    const blob = new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={download} disabled={rows.length === 0}>
      <Download size={14} /> CSV
    </button>
  );
}
