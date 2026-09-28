// Workforce CSV import (spec 98, QA 30 / 40): training records,
// competency assessments and qualifications / licences
// (person_credentials). Pure and unit-tested — the page only parses,
// shows the preview, and writes what came back in `rows`.
//
// TENANCY. The file never names a database id: a column called `id` or
// ending in `_id` rejects the whole file. People are matched by email
// (case-insensitive) or employee number, and catalogue items by exact
// title, against reference data from the ACTIVE organisation only —
// this function drops any reference row from another organisation
// before matching, so a stray row can never be used, and anything
// unmatched is an error, never a guess. The database (RLS, the 134
// evidence guard, assert_catalogue) is still the boundary; this is the
// row-level report a person can act on before anything is written.

export const IMPORT_KINDS = ['training', 'competency', 'credential'] as const;
export type ImportKind = typeof IMPORT_KINDS[number];
export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  training: 'Training records',
  competency: 'Competency assessments',
  credential: 'Qualifications, certificates and licences',
};

/** Canonical column → accepted header spellings (lower-case, spaces as _). */
const ALIASES: Record<string, string[]> = {
  email: ['email', 'person_email', 'employee_email', 'work_email'],
  employee_number: ['employee_number', 'employee_no', 'staff_number', 'payroll_number'],
  course: ['course', 'course_title', 'course_name', 'training_course'],
  completed_on: ['completed_on', 'completed', 'completion_date', 'date_completed'],
  expires_on: ['expires_on', 'expiry_date', 'expiry', 'expires', 'expiry_on'],
  result: ['result'],
  provider: ['provider', 'training_provider'],
  certificate_number: ['certificate_number', 'certificate_no'],
  notes: ['notes'],
  competency: ['competency', 'competency_title'],
  level: ['level', 'competency_level'],
  assessed_on: ['assessed_on', 'assessment_date', 'date_assessed'],
  assessment_method: ['assessment_method', 'method'],
  assessor_name: ['assessor_name', 'assessor'],
  credential: ['credential', 'credential_type', 'qualification', 'licence', 'certificate', 'title'],
  kind: ['kind', 'credential_kind'],
  issued_on: ['issued_on', 'issue_date', 'issued', 'date_issued'],
  credential_number: ['credential_number', 'number', 'licence_number', 'card_number'],
  awarding_body: ['awarding_body', 'issuer', 'issuing_body'],
};

export const KIND_COLUMNS: Record<ImportKind, { required: string[]; optional: string[] }> = {
  training: { required: ['course', 'completed_on'], optional: ['expires_on', 'result', 'provider', 'certificate_number', 'notes'] },
  competency: { required: ['competency', 'level', 'assessed_on'], optional: ['expires_on', 'assessment_method', 'assessor_name'] },
  credential: { required: ['credential', 'issued_on'], optional: ['kind', 'expires_on', 'credential_number', 'awarding_body'] },
};

const TRAINING_RESULTS = ['pass', 'fail', 'attended'] as const;
const CREDENTIAL_KINDS = ['qualification', 'certification', 'licence', 'card', 'permit'] as const;
const ASSESSMENT_METHODS: Record<string, string> = {
  practical_observation: 'Practical observation', external_certificate: 'External certificate', assessment: 'Assessment',
  supervisor_signoff: 'Supervisor sign-off', qualification: 'Qualification', logged_experience: 'Logged experience',
  competency_test: 'Competency test',
};

// ─── Reference data (from the active organisation) ──────────────────

export interface ImportPerson { id: string; company_id: string; full_name: string; email: string | null; employee_number: string | null }
export interface ImportCatalogueItem {
  id: string; company_id: string | null; title: string;
  kind?: string | null; safety_critical?: boolean | null; assessment_method?: string | null;
}
export interface ImportLevel { id: string; company_id: string | null; key: string; label: string }
export interface ImportReference {
  companyId: string;
  /** Today in the organisation's calendar (ISO). Dates after it are refused. */
  today: string;
  people: readonly ImportPerson[];
  courses?: readonly ImportCatalogueItem[];
  competencies?: readonly ImportCatalogueItem[];
  levels?: readonly ImportLevel[];
  credentialTypes?: readonly ImportCatalogueItem[];
}

// ─── Output ─────────────────────────────────────────────────────────

export interface TrainingInsert {
  company_id: string; person_id: string; course_id: string; course_name: string; completed_on: string; expires_on: string | null;
  result: typeof TRAINING_RESULTS[number]; provider: string | null; certificate_number: string | null; notes: string | null; source: 'import';
}
export interface CompetencyInsert {
  company_id: string; person_id: string; competency_id: string; level_id: string; assessed_on: string; expires_on: string | null;
  assessment_method: string; assessor_name: string | null;
}
export interface CredentialInsert {
  company_id: string; person_id: string; credential_type_id: string; issued_on: string; expires_on: string | null;
  credential_number: string | null; awarding_body: string | null; source: 'import';
}
export type ImportRecord = TrainingInsert | CompetencyInsert | CredentialInsert;

export interface ImportRow {
  line: number;
  kind: ImportKind;
  personName: string;
  itemName: string;
  /** completed_on / assessed_on / issued_on */
  date: string;
  safetyCritical: boolean;
  /** person | catalogue item | date — the duplicate identity. */
  key: string;
  record: ImportRecord;
}
export interface ImportIssue { line: number; message: string }
export interface ParsedImport {
  rows: ImportRow[];
  errors: ImportIssue[];
  /** Rows repeating an earlier row of the same file (skipped). */
  duplicates: ImportIssue[];
  /** Header columns this kind does not use (ignored). */
  ignoredColumns: string[];
}

// ─── CSV ────────────────────────────────────────────────────────────

/** RFC 4180: quoted fields may hold commas, doubled quotes and newlines.
 *  Returns each record with the 1-based line it started on. */
export function splitCsv(text: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  let line = 1;
  let start = 1;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cells.push(cur); cur = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      cells.push(cur);
      out.push({ line: start, cells });
      cells = []; cur = ''; line++; start = line;
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || cells.length > 0) { cells.push(cur); out.push({ line: start, cells }); }
  return out
    .map(r => ({ line: r.line, cells: r.cells.map(s => s.trim()) }))
    .filter(r => r.cells.some(s => s.length > 0));
}

/** ISO yyyy-mm-dd or UK dd/mm/yyyy (also dd-mm-yyyy, dd.mm.yyyy), checked
 *  against the calendar: 31/02/2026 is malformed, not 3 March. */
export function parseImportDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; } else {
    r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
  }
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const headerNorm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');
const isIdColumn = (h: string) => h === 'id' || h === 'uuid' || h.endsWith('_id') || h.endsWith('_uuid');

function canonical(h: string): string | null {
  for (const [key, names] of Object.entries(ALIASES)) if (names.includes(h)) return key;
  return null;
}

/** Match one catalogue title: the organisation's own row first, then a global one. */
function matchItem(items: readonly ImportCatalogueItem[], title: string, kind?: string): ImportCatalogueItem[] {
  const t = norm(title);
  const hits = items.filter(i => norm(i.title) === t && (!kind || i.kind === kind));
  const own = hits.filter(i => i.company_id !== null);
  return own.length ? own : hits;
}

export function parseImportCsv(kind: ImportKind, text: string, ref: ImportReference): ParsedImport {
  const rows: ImportRow[] = [];
  const errors: ImportIssue[] = [];
  const duplicates: ImportIssue[] = [];
  const records = splitCsv(text);
  if (records.length === 0) return { rows, errors: [{ line: 1, message: 'The file is empty.' }], duplicates, ignoredColumns: [] };

  const header = records[0].cells.map(headerNorm);
  const idCols = header.filter(isIdColumn);
  if (idCols.length) {
    return { rows, duplicates, ignoredColumns: [], errors: [{ line: records[0].line,
      message: `Columns ${idCols.join(', ')} are not accepted. Nothing is matched by id: people are matched by email or employee number, and courses, competencies and credentials by their exact title, within the organisation you are working in.` }] };
  }

  const col = new Map<string, number>();
  const ignoredColumns: string[] = [];
  const wanted = new Set(['email', 'employee_number', ...KIND_COLUMNS[kind].required, ...KIND_COLUMNS[kind].optional]);
  header.forEach((h, i) => {
    const c = canonical(h);
    if (c && wanted.has(c) && !col.has(c)) col.set(c, i);
    else if (h) ignoredColumns.push(h);
  });
  const missing = KIND_COLUMNS[kind].required.filter(c => !col.has(c));
  if (!col.has('email') && !col.has('employee_number')) missing.unshift('email or employee_number');
  if (missing.length) {
    return { rows, duplicates, ignoredColumns, errors: [{ line: records[0].line, message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` }] };
  }

  // Reference data from the active organisation only.
  const people = ref.people.filter(p => p.company_id === ref.companyId);
  const inOrg = <T extends { company_id: string | null }>(xs: readonly T[] | undefined) =>
    (xs ?? []).filter(x => x.company_id === null || x.company_id === ref.companyId);
  const courses = inOrg(ref.courses);
  const competencies = inOrg(ref.competencies);
  const levels = inOrg(ref.levels);
  const credentialTypes = inOrg(ref.credentialTypes);

  const byEmail = new Map<string, ImportPerson[]>();
  const byNumber = new Map<string, ImportPerson[]>();
  for (const p of people) {
    if (p.email) byEmail.set(p.email.trim().toLowerCase(), [...(byEmail.get(p.email.trim().toLowerCase()) ?? []), p]);
    if (p.employee_number) byNumber.set(p.employee_number.trim(), [...(byNumber.get(p.employee_number.trim()) ?? []), p]);
  }

  const seen = new Map<string, number>();

  for (const rec of records.slice(1)) {
    const line = rec.line;
    const get = (c: string) => { const i = col.get(c); return i === undefined ? '' : (rec.cells[i] ?? '').trim(); };
    const fail = (message: string) => errors.push({ line, message });

    // Person.
    const email = get('email').toLowerCase();
    const number = get('employee_number');
    if (!email && !number) { fail('No email or employee number.'); continue; }
    const eHits = email ? byEmail.get(email) ?? [] : [];
    const nHits = number ? byNumber.get(number) ?? [] : [];
    if (email && eHits.length === 0) { fail(`No one in this organisation has the email ${email}.`); continue; }
    if (eHits.length > 1) { fail(`More than one person has the email ${email}; use the employee number instead.`); continue; }
    if (!email && nHits.length === 0) { fail(`No one in this organisation has employee number ${number}.`); continue; }
    if (!email && nHits.length > 1) { fail(`More than one person has employee number ${number}.`); continue; }
    if (email && number && !nHits.some(p => p.id === eHits[0].id)) {
      fail(`Employee number ${number} does not belong to ${eHits[0].full_name} (${email}).`); continue;
    }
    const person = email ? eHits[0] : nHits[0];

    const expiresRaw = get('expires_on');
    const expires = expiresRaw ? parseImportDate(expiresRaw) : null;
    if (expiresRaw && !expires) { fail(`expires_on "${expiresRaw}" is not a date (use yyyy-mm-dd or dd/mm/yyyy).`); continue; }

    let row: ImportRow | null = null;

    if (kind === 'training') {
      const title = get('course');
      if (!title) { fail('No course.'); continue; }
      const hits = matchItem(courses, title);
      if (hits.length !== 1) { fail(hits.length ? `More than one course is called "${title}".` : `No course called "${title}" in the catalogue.`); continue; }
      const raw = get('completed_on');
      const completed = parseImportDate(raw);
      if (!completed) { fail(raw ? `completed_on "${raw}" is not a date (use yyyy-mm-dd or dd/mm/yyyy).` : 'No completed_on date.'); continue; }
      if (completed > ref.today) { fail(`completed_on ${completed} is in the future.`); continue; }
      if (expires && expires <= completed) { fail('expires_on must be after completed_on.'); continue; }
      const resultRaw = get('result').toLowerCase();
      const result = (resultRaw || 'pass') as TrainingInsert['result'];
      if (!(TRAINING_RESULTS as readonly string[]).includes(result)) { fail(`result "${resultRaw}" must be pass, fail or attended.`); continue; }
      const course = hits[0];
      row = { line, kind, personName: person.full_name, itemName: course.title, date: completed,
        safetyCritical: !!course.safety_critical, key: `${person.id}|${course.id}|${completed}`,
        record: { company_id: ref.companyId, person_id: person.id, course_id: course.id, course_name: course.title,
          completed_on: completed, expires_on: expires, result, provider: get('provider') || null,
          certificate_number: get('certificate_number') || null, notes: get('notes') || null, source: 'import' } };
    } else if (kind === 'competency') {
      const title = get('competency');
      if (!title) { fail('No competency.'); continue; }
      const hits = matchItem(competencies, title);
      if (hits.length !== 1) { fail(hits.length ? `More than one competency is called "${title}".` : `No competency called "${title}" in the catalogue.`); continue; }
      const lv = norm(get('level'));
      if (!lv) { fail('No level.'); continue; }
      const lvHits = levels.filter(l => norm(l.label) === lv || l.key === lv.replace(/ /g, '_'));
      const lvOwn = lvHits.filter(l => l.company_id !== null);
      const lvPick = lvOwn.length ? lvOwn : lvHits;
      if (lvPick.length !== 1) { fail(`No competency level called "${get('level')}".`); continue; }
      const raw = get('assessed_on');
      const assessed = parseImportDate(raw);
      if (!assessed) { fail(raw ? `assessed_on "${raw}" is not a date (use yyyy-mm-dd or dd/mm/yyyy).` : 'No assessed_on date.'); continue; }
      if (assessed > ref.today) { fail(`assessed_on ${assessed} is in the future.`); continue; }
      if (expires && expires < assessed) { fail('expires_on must not be before assessed_on.'); continue; }
      const comp = hits[0];
      const mRaw = get('assessment_method');
      let method = comp.assessment_method ?? 'assessment';
      if (mRaw) {
        const k = mRaw.trim().toLowerCase().replace(/[\s-]+/g, '_');
        const found = Object.entries(ASSESSMENT_METHODS).find(([key, label]) => key === k || norm(label) === norm(mRaw));
        if (!found) { fail(`assessment_method "${mRaw}" is not recognised.`); continue; }
        method = found[0];
      }
      row = { line, kind, personName: person.full_name, itemName: `${comp.title} (${lvPick[0].label})`, date: assessed,
        safetyCritical: !!comp.safety_critical, key: `${person.id}|${comp.id}|${assessed}`,
        record: { company_id: ref.companyId, person_id: person.id, competency_id: comp.id, level_id: lvPick[0].id,
          assessed_on: assessed, expires_on: expires, assessment_method: method, assessor_name: get('assessor_name') || null } };
    } else {
      const title = get('credential');
      if (!title) { fail('No credential.'); continue; }
      const kindRaw = get('kind').toLowerCase();
      if (kindRaw && !(CREDENTIAL_KINDS as readonly string[]).includes(kindRaw)) {
        fail(`kind "${kindRaw}" must be one of ${CREDENTIAL_KINDS.join(', ')}.`); continue;
      }
      const hits = matchItem(credentialTypes, title, kindRaw || undefined);
      if (hits.length !== 1) {
        fail(hits.length ? `More than one credential is called "${title}"; add a kind column to say which.` : `No credential called "${title}" in the catalogue.`);
        continue;
      }
      const raw = get('issued_on');
      const issued = parseImportDate(raw);
      if (!issued) { fail(raw ? `issued_on "${raw}" is not a date (use yyyy-mm-dd or dd/mm/yyyy).` : 'No issued_on date.'); continue; }
      if (issued > ref.today) { fail(`issued_on ${issued} is in the future.`); continue; }
      if (expires && expires < issued) { fail('expires_on must not be before issued_on.'); continue; }
      const ct = hits[0];
      row = { line, kind, personName: person.full_name, itemName: ct.title, date: issued, safetyCritical: false,
        key: `${person.id}|${ct.id}|${issued}`,
        record: { company_id: ref.companyId, person_id: person.id, credential_type_id: ct.id, issued_on: issued, expires_on: expires,
          credential_number: get('credential_number') || null, awarding_body: get('awarding_body') || null, source: 'import' } };
    }

    const first = seen.get(row.key);
    if (first !== undefined) { duplicates.push({ line, message: `Repeats line ${first}; skipped.` }); continue; }
    seen.set(row.key, line);
    rows.push(row);
  }

  return { rows, errors, duplicates, ignoredColumns };
}

// ─── Already on record ──────────────────────────────────────────────

/** The same duplicate identity, built from a row already in the database. */
export function existingKey(kind: ImportKind, r: Record<string, unknown>): string {
  if (kind === 'training') return `${r.person_id}|${r.course_id}|${r.completed_on}`;
  if (kind === 'competency') return `${r.person_id}|${r.competency_id}|${r.assessed_on}`;
  return `${r.person_id}|${r.credential_type_id}|${r.issued_on}`;
}

/** The columns to read back for existingKey(). */
export const EXISTING_COLUMNS: Record<ImportKind, { table: string; columns: string }> = {
  training: { table: 'training_records', columns: 'id, person_id, course_id, completed_on' },
  competency: { table: 'person_competencies', columns: 'id, person_id, competency_id, assessed_on' },
  credential: { table: 'person_credentials', columns: 'id, person_id, credential_type_id, issued_on' },
};

/** Split parsed rows into those to write and those already on record. */
export function splitExisting(rows: readonly ImportRow[], existing: ReadonlySet<string>): { toWrite: ImportRow[]; skipped: ImportIssue[] } {
  const toWrite: ImportRow[] = [];
  const skipped: ImportIssue[] = [];
  for (const r of rows) {
    if (existing.has(r.key)) skipped.push({ line: r.line, message: `${r.personName} — ${r.itemName} on ${r.date} is already on record; skipped.` });
    else toWrite.push(r);
  }
  return { toWrite, skipped };
}

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** The largest insert the page sends in one request. */
export const IMPORT_BATCH = 500;
