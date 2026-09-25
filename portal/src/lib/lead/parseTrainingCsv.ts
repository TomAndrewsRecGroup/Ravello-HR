// Workforce CSV import for training records. Pure and unit-tested: the
// UI only calls parseTrainingCsv() and then inserts whatever comes back
// in `matched` — all of the "does this row make sense" logic lives here
// so it can be tested without a browser file picker or a database.
//
// Expected header (case-insensitive, any order): employee_email or
// employee_name (at least one, email preferred when both are given and
// disagree — an email is a more reliable match key than a name two
// people might share), course_name, completed_on, and optionally
// provider, expires_on, notes.

export interface TrainingCsvEmployee { id: string; full_name: string; email: string | null; }

export interface MatchedTrainingRow {
  employee_id:  string;
  course_name:  string;
  provider:     string | null;
  completed_on: string;
  expires_on:   string | null;
  notes:        string | null;
}

export interface UnmatchedTrainingRow {
  line:   number; // 1-based, counting the header as line 1
  reason: string;
}

export interface ParsedTrainingCsv {
  matched:   MatchedTrainingRow[];
  unmatched: UnmatchedTrainingRow[];
}

/** Minimal RFC4180 line splitter: handles quoted fields containing
 *  commas or escaped quotes ("") — enough for what Excel/Sheets export. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts ISO (2026-09-25) or common UK dd/mm/yyyy; returns ISO or null. */
function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (ISO_DATE.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function parseTrainingCsv(text: string, employees: readonly TrainingCsvEmployee[]): ParsedTrainingCsv {
  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
  const matched: MatchedTrainingRow[] = [];
  const unmatched: UnmatchedTrainingRow[] = [];
  if (lines.length === 0) return { matched, unmatched };

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (name: string) => header.indexOf(name);
  const iEmail = idx('employee_email');
  const iName = idx('employee_name');
  const iCourse = idx('course_name');
  const iProvider = idx('provider');
  const iCompleted = idx('completed_on');
  const iExpires = idx('expires_on');
  const iNotes = idx('notes');

  if (iCourse === -1 || iCompleted === -1 || (iEmail === -1 && iName === -1)) {
    unmatched.push({ line: 1, reason: 'Header must include course_name, completed_on, and employee_email or employee_name' });
    return { matched, unmatched };
  }

  const byEmail = new Map(employees.filter(e => e.email).map(e => [e.email!.toLowerCase().trim(), e]));
  const byName = new Map(employees.map(e => [e.full_name.toLowerCase().trim(), e]));

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const lineNo = i + 1;
    const email = iEmail >= 0 ? cells[iEmail]?.toLowerCase().trim() : '';
    const name = iName >= 0 ? cells[iName]?.trim() : '';
    const employee = (email && byEmail.get(email)) || (name && byName.get(name.toLowerCase()));
    if (!employee) {
      unmatched.push({ line: lineNo, reason: `No employee matched "${email || name || '(blank)'}"` });
      continue;
    }
    const courseName = cells[iCourse]?.trim();
    if (!courseName) {
      unmatched.push({ line: lineNo, reason: 'Missing course_name' });
      continue;
    }
    const completedOn = normaliseDate(cells[iCompleted] ?? '');
    if (!completedOn) {
      unmatched.push({ line: lineNo, reason: `Missing or unrecognised completed_on ("${cells[iCompleted] ?? ''}")` });
      continue;
    }
    const expiresRaw = iExpires >= 0 ? (cells[iExpires] ?? '') : '';
    const expiresOn = expiresRaw ? normaliseDate(expiresRaw) : null;
    if (expiresRaw && !expiresOn) {
      unmatched.push({ line: lineNo, reason: `Unrecognised expires_on ("${expiresRaw}")` });
      continue;
    }
    matched.push({
      employee_id: employee.id,
      course_name: courseName,
      provider: iProvider >= 0 ? (cells[iProvider]?.trim() || null) : null,
      completed_on: completedOn,
      expires_on: expiresOn,
      notes: iNotes >= 0 ? (cells[iNotes]?.trim() || null) : null,
    });
  }

  return { matched, unmatched };
}
