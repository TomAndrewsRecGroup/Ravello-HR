'use client';
import { Download } from 'lucide-react';

interface Props {
  data:     Record<string, unknown>[];
  filename: string;
  label?:   string;
  /** Explicit column order. Used as the header row when data is empty
   *  (otherwise the button would have no schema to write). When data
   *  has rows, this is still respected — falls back to keys of the
   *  first row if not provided. */
  headers?: string[];
}

function toCSV(rows: Record<string, unknown>[], headers?: string[]): string {
  const keys = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (keys.length === 0) return '';

  function escape(val: unknown): string {
    if (val === null || val === undefined) return '';
    const s = String(val).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  }

  const headerLine = keys.map(k => escape(k)).join(',');
  if (rows.length === 0) return headerLine + '\n';
  const body = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n');
  return `${headerLine}\n${body}`;
}

export default function ExportCSVButton({ data, filename, label = 'Export CSV', headers }: Props) {
  function download() {
    const csv  = toCSV(data, headers);
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

  // Button stays enabled even when data is empty so the admin can
  // download a header-only CSV (template) when no rows exist yet.
  // Caller passes `headers` to ensure that schema is well-known.
  return (
    <button onClick={download} className="btn-secondary btn-sm flex items-center gap-1.5">
      <Download size={13} /> {label}
      {data.length > 0 && (
        <span className="text-[10px] font-medium px-1 py-0 rounded" style={{ background: 'var(--surface-alt)', color: 'var(--ink-faint)' }}>
          {data.length}
        </span>
      )}
    </button>
  );
}
