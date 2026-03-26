'use client';
import { Download } from 'lucide-react';

interface Props {
  data:     Record<string, unknown>[];
  filename: string;
  label?:   string;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);

  function escape(val: unknown): string {
    if (val === null || val === undefined) return '';
    const s = String(val).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  }

  const header = keys.map(k => escape(k)).join(',');
  const body   = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export default function ExportCSVButton({ data, filename, label = 'Export CSV' }: Props) {
  function download() {
    const csv  = toCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={download} className="btn-secondary btn-sm flex items-center gap-1.5" disabled={!data.length}>
      <Download size={13} /> {label}
    </button>
  );
}
