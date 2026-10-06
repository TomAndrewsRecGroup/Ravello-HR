import type { MergeFieldDef } from './types';

// Resolving a template's declared merge fields into real values —
// never a guess. 'employee'/'manual' fields with nothing on file
// resolve to '', which renderMergeFields() (types.ts) then leaves
// visibly unfilled in the preview rather than silently inventing
// content; 'missing' names every such field so the generator sees at
// a glance what still needs typing before this can be sent.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && ISO_DATE_RE.test(v)) {
    return new Date(`${v}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return String(v);
}

/** Today's date, formatted the same way an ISO employee-record date is. */
export function todayDateUK(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface MergeFieldInputs {
  /** Non-HR-sensitive employee_records columns (job_title, start_date, ...). */
  employeeSafe: Record<string, unknown>;
  /** HR-sensitive columns (salary, ...), already gated by employee_private_fields(). */
  employeeHr: Record<string, unknown>;
  companyName: string;
  /** Typed by whoever is generating the document, keyed by field key. */
  manual: Record<string, string>;
}

export function resolveMergeFieldValues(
  fields: MergeFieldDef[], inputs: MergeFieldInputs,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of fields) {
    let v = '';
    if (f.source === 'date') {
      v = todayDateUK();
    } else if (f.source === 'company') {
      v = inputs.companyName;
    } else if (f.source === 'employee' && f.employee_column) {
      const raw = f.employee_column in inputs.employeeSafe
        ? inputs.employeeSafe[f.employee_column]
        : inputs.employeeHr[f.employee_column];
      v = formatValue(raw);
    } else if (f.source === 'manual') {
      v = inputs.manual[f.key] ?? '';
    }
    values[f.key] = v;
    if (!v.trim() && f.source !== 'date') missing.push(f.key);
  }
  return { values, missing };
}
