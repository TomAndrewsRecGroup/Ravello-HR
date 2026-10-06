// Contract/policy template library with native e-signing (migration
// 213). Part 2 of the Peninsula-style gap-closure programme — see
// CLAUDE.md's "Part 1" entry (212) for the account-contact half.
//
// `category` reuses DocCategory/DOC_CATEGORIES (lib/ui/statusMaps.ts)
// — one vocabulary, never a parallel copy.

export const DOCUMENT_TEMPLATE_STATUSES = ['draft', 'active', 'superseded', 'archived'] as const;
export type DocumentTemplateStatus = typeof DOCUMENT_TEMPLATE_STATUSES[number];

export const DOCUMENT_TEMPLATE_STATUS_LABELS: Record<DocumentTemplateStatus, string> = {
  draft: 'Draft', active: 'Active', superseded: 'Superseded', archived: 'Archived',
};

export const DOCUMENT_INSTANCE_STATUSES = ['draft', 'sent_for_signature', 'signed', 'declined', 'voided'] as const;
export type DocumentInstanceStatus = typeof DOCUMENT_INSTANCE_STATUSES[number];

export const DOCUMENT_INSTANCE_STATUS_LABELS: Record<DocumentInstanceStatus, string> = {
  draft: 'Draft', sent_for_signature: 'Sent for signature', signed: 'Signed',
  declined: 'Declined', voided: 'Voided',
};

// A merge field a template names, filled either from an existing
// record (never a guess — the generator must supply a value for every
// field with no `source`) or typed by whoever generates the document.
export type MergeFieldSource = 'employee' | 'company' | 'date' | 'manual';

export interface MergeFieldDef {
  key: string;
  label: string;
  source: MergeFieldSource;
  /** Only when source === 'employee': the employee_records column to read via employeePrivate.ts. */
  employee_column?: string;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  category: string;
  description: string | null;
  body: string;
  merge_fields: MergeFieldDef[];
  requires_signature: boolean;
  is_example: boolean;
  status: DocumentTemplateStatus;
  supersedes_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentInstance {
  id: string;
  company_id: string;
  template_id: string;
  employee_id: string;
  category: string;
  rendered_title: string;
  rendered_body: string;
  merge_values: Record<string, string>;
  requires_signature: boolean;
  status: DocumentInstanceStatus;
  storage_path: string | null;
  created_by: string | null;
  sent_for_signature_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Renders {{merge_field}} placeholders with their known values. An
 * unmatched placeholder is left verbatim — never silently dropped —
 * so a generator can see at a glance which field it forgot to fill. */
export function renderMergeFields(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/** Every {{field}} placeholder named in a template body, deduplicated,
 * in first-appearance order — used to cross-check a template's own
 * declared merge_fields against what its body actually references. */
export function extractMergeFieldKeys(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const key = m[1];
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}
