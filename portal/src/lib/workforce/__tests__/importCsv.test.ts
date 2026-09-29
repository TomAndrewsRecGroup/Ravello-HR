import { describe, expect, it } from 'vitest';
import {
  chunk, existingKey, parseImportCsv, parseImportDate, splitCsv, splitExisting,
  type ImportReference, type TrainingInsert, type CompetencyInsert, type CredentialInsert,
} from '../importCsv';

const ORG = 'org-a';
const OTHER = 'org-b';
const ref: ImportReference = {
  companyId: ORG,
  today: '2026-09-28',
  people: [
    { id: 'p1', company_id: ORG, full_name: 'Ann Smith', email: 'Ann@Example.com', employee_number: 'E1' },
    { id: 'p2', company_id: ORG, full_name: 'Bob Jones', email: 'bob@example.com', employee_number: 'E2' },
    { id: 'p3', company_id: ORG, full_name: 'Twin One', email: 'shared@example.com', employee_number: 'E3' },
    { id: 'p4', company_id: ORG, full_name: 'Twin Two', email: 'shared@example.com', employee_number: 'E4' },
    // Another organisation's person, even if it somehow reached the page.
    { id: 'px', company_id: OTHER, full_name: 'Eve Other', email: 'eve@other.com', employee_number: 'X1' },
  ],
  courses: [
    { id: 'c1', company_id: ORG, title: 'Manual Handling', safety_critical: false },
    { id: 'c2', company_id: null, title: 'Working at Height', safety_critical: true },
    { id: 'cx', company_id: OTHER, title: 'Secret Course' },
  ],
  competencies: [
    { id: 'k1', company_id: ORG, title: 'Forklift operation', safety_critical: true, assessment_method: 'practical_observation' },
  ],
  levels: [
    { id: 'l4', company_id: null, key: 'competent', label: 'Competent' },
    { id: 'l3', company_id: null, key: 'supervised', label: 'Supervised' },
  ],
  credentialTypes: [
    { id: 't1', company_id: null, title: 'CSCS Card', kind: 'card' },
    { id: 't2', company_id: ORG, title: 'First Aid', kind: 'certification' },
    { id: 't3', company_id: ORG, title: 'First Aid', kind: 'qualification' },
  ],
};

describe('splitCsv', () => {
  it('handles quoted commas, doubled quotes, CRLF and quoted newlines', () => {
    const r = splitCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n\n');
    expect(r).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['x, y', 'say "hi"'] },
      { line: 3, cells: ['multi\nline', 'z'] },
    ]);
  });
  it('strips a byte-order mark', () => {
    expect(splitCsv('﻿email\nx')[0].cells).toEqual(['email']);
  });
});

describe('parseImportDate', () => {
  it('accepts ISO and UK dates', () => {
    expect(parseImportDate('2026-03-15')).toBe('2026-03-15');
    expect(parseImportDate('15/03/2026')).toBe('2026-03-15');
    expect(parseImportDate('5/3/2026')).toBe('2026-03-05');
  });
  it('rejects malformed and impossible dates', () => {
    for (const d of ['31/02/2026', '2026-13-01', '2026-02-30', '03/15/2026', 'yesterday', '2026/03/15', '15-03-26', '']) {
      expect(parseImportDate(d)).toBeNull();
    }
  });
});

describe('parseImportCsv — training', () => {
  it('parses valid rows, matching by email (case-insensitive) or employee number', () => {
    const csv = [
      'email,employee_number,course,completed_on,expires_on,provider,extra_column',
      'ANN@example.com,,Manual Handling,2026-01-10,2029-01-10,Acme,ignored',
      ',E2,working at height,10/02/2026,,,',
    ].join('\n');
    const p = parseImportCsv('training', csv, ref);
    expect(p.errors).toEqual([]);
    expect(p.ignoredColumns).toEqual(['extra_column']);
    expect(p.rows).toHaveLength(2);
    const r0 = p.rows[0].record as TrainingInsert;
    expect(r0).toMatchObject({ person_id: 'p1', course_id: 'c1', completed_on: '2026-01-10', expires_on: '2029-01-10',
      provider: 'Acme', result: 'pass', source: 'import', company_id: ORG });
    expect(p.rows[1].record).toMatchObject({ person_id: 'p2', course_id: 'c2', completed_on: '2026-02-10', expires_on: null });
    expect(p.rows[1].safetyCritical).toBe(true);
  });

  it('never sends a verification field', () => {
    const p = parseImportCsv('training', 'email,course,completed_on\nann@example.com,Manual Handling,2026-01-10', ref);
    const rec = p.rows[0].record as unknown as Record<string, unknown>;
    for (const k of ['verification_status', 'verified_by', 'verified_at', 'submitted_by', 'id']) expect(rec).not.toHaveProperty(k);
  });

  it('refuses any id column — malicious cross-tenant ids cannot be injected', () => {
    for (const h of ['person_id', 'company_id', 'course_id', 'id', 'Organisation ID']) {
      const p = parseImportCsv('training', `email,course,completed_on,${h}\nann@example.com,Manual Handling,2026-01-10,px`, ref);
      expect(p.rows).toEqual([]);
      expect(p.errors[0].message).toMatch(/not accepted/);
    }
  });

  it('never matches another organisation\'s person or course', () => {
    const p = parseImportCsv('training', [
      'email,employee_number,course,completed_on',
      'eve@other.com,,Manual Handling,2026-01-10',
      ',X1,Manual Handling,2026-01-10',
      'ann@example.com,,Secret Course,2026-01-10',
    ].join('\n'), ref);
    expect(p.rows).toEqual([]);
    expect(p.errors.map(e => e.line)).toEqual([2, 3, 4]);
    expect(p.errors[0].message).toMatch(/No one in this organisation has the email/);
    expect(p.errors[2].message).toMatch(/No course called "Secret Course"/);
  });

  it('reports unknown people, unknown courses and ambiguous emails by line', () => {
    const p = parseImportCsv('training', [
      'email,course,completed_on',
      'nobody@example.com,Manual Handling,2026-01-10',
      'ann@example.com,Juggling,2026-01-10',
      'shared@example.com,Manual Handling,2026-01-10',
      ',Manual Handling,2026-01-10',
    ].join('\n'), ref);
    expect(p.rows).toEqual([]);
    expect(p.errors).toEqual([
      { line: 2, message: 'No one in this organisation has the email nobody@example.com.' },
      { line: 3, message: 'No course called "Juggling" in the catalogue.' },
      { line: 4, message: expect.stringMatching(/More than one person/) },
      { line: 5, message: 'No email or employee number.' },
    ]);
  });

  it('refuses an email and employee number that point at different people', () => {
    const p = parseImportCsv('training', 'email,employee_number,course,completed_on\nann@example.com,E2,Manual Handling,2026-01-10', ref);
    expect(p.errors[0].message).toMatch(/does not belong to Ann Smith/);
  });

  it('rejects malformed, future and inverted dates, and a bad result', () => {
    const p = parseImportCsv('training', [
      'email,course,completed_on,expires_on,result',
      'ann@example.com,Manual Handling,31/02/2026,,',
      'ann@example.com,Manual Handling,2026-12-01,,',
      'ann@example.com,Manual Handling,2026-01-10,2026-01-10,',
      'ann@example.com,Manual Handling,2026-01-10,soon,',
      'ann@example.com,Manual Handling,2026-01-10,,excellent',
      'ann@example.com,Manual Handling,,,',
    ].join('\n'), ref);
    expect(p.rows).toEqual([]);
    expect(p.errors.map(e => e.message)).toEqual([
      expect.stringMatching(/completed_on "31\/02\/2026" is not a date/),
      'completed_on 2026-12-01 is in the future.',
      'expires_on must be after completed_on.',
      expect.stringMatching(/expires_on "soon" is not a date/),
      expect.stringMatching(/result "excellent"/),
      'No completed_on date.',
    ]);
  });

  it('flags duplicate rows within the file (same person, course and date, however written)', () => {
    const p = parseImportCsv('training', [
      'email,employee_number,course,completed_on',
      'ann@example.com,,Manual Handling,2026-01-10',
      ',E1,manual handling,10/01/2026',
      'ann@example.com,,Manual Handling,2026-01-11',
    ].join('\n'), ref);
    expect(p.rows.map(r => r.line)).toEqual([2, 4]);
    expect(p.duplicates).toEqual([{ line: 3, message: 'Repeats line 2; skipped.' }]);
  });

  it('reports missing columns once, on the header', () => {
    const p = parseImportCsv('training', 'name,course\nAnn,Manual Handling', ref);
    expect(p.errors).toEqual([{ line: 1, message: 'Missing columns: email or employee_number, completed_on.' }]);
  });

  it('says an empty file is empty', () => {
    expect(parseImportCsv('training', '\n\n', ref).errors[0].message).toMatch(/empty/);
  });
});

describe('parseImportCsv — competency', () => {
  it('matches competency and level by label or key, defaulting the method', () => {
    const p = parseImportCsv('competency', [
      'email,competency,level,assessed_on,assessor',
      'bob@example.com,Forklift Operation,Competent,2026-05-01,J. Assessor',
      'ann@example.com,Forklift operation,supervised,2026-05-01,',
    ].join('\n'), ref);
    expect(p.errors).toEqual([]);
    expect(p.rows[0].record as CompetencyInsert).toMatchObject({ person_id: 'p2', competency_id: 'k1', level_id: 'l4',
      assessed_on: '2026-05-01', assessment_method: 'practical_observation', assessor_name: 'J. Assessor' });
    expect(p.rows[1].record).toMatchObject({ level_id: 'l3' });
  });

  it('rejects an unknown level or method', () => {
    const p = parseImportCsv('competency', [
      'email,competency,level,assessed_on,method',
      'bob@example.com,Forklift operation,Expert,2026-05-01,',
      'bob@example.com,Forklift operation,Competent,2026-05-01,vibes',
    ].join('\n'), ref);
    expect(p.errors.map(e => e.line)).toEqual([2, 3]);
  });
});

describe('parseImportCsv — credentials', () => {
  it('matches by title, and needs the kind when a title is shared', () => {
    const p = parseImportCsv('credential', [
      'email,credential,kind,issued_on,expires_on,number',
      'ann@example.com,CSCS Card,,2025-01-01,2030-01-01,123',
      'ann@example.com,First Aid,,2025-01-01,,',
      'ann@example.com,First Aid,certification,2025-01-01,,',
      'ann@example.com,First Aid,diploma,2025-01-01,,',
    ].join('\n'), ref);
    expect(p.rows.map(r => r.line)).toEqual([2, 4]);
    expect(p.rows[0].record as CredentialInsert).toMatchObject({ credential_type_id: 't1', credential_number: '123', source: 'import' });
    expect(p.rows[1].record).toMatchObject({ credential_type_id: 't2' });
    expect(p.errors.map(e => e.line)).toEqual([3, 5]);
    expect(p.errors[0].message).toMatch(/add a kind column/);
  });
});

describe('already on record', () => {
  it('skips rows whose person, item and date already exist', () => {
    const p = parseImportCsv('training', [
      'email,course,completed_on',
      'ann@example.com,Manual Handling,2026-01-10',
      'bob@example.com,Manual Handling,2026-01-10',
    ].join('\n'), ref);
    const existing = new Set([existingKey('training', { person_id: 'p1', course_id: 'c1', completed_on: '2026-01-10' })]);
    const { toWrite, skipped } = splitExisting(p.rows, existing);
    expect(toWrite.map(r => r.line)).toEqual([3]);
    expect(skipped).toEqual([{ line: 2, message: 'Ann Smith — Manual Handling on 2026-01-10 is already on record; skipped.' }]);
  });

  it('builds the same key for competencies and credentials', () => {
    expect(existingKey('competency', { person_id: 'p', competency_id: 'k', assessed_on: '2026-01-01' })).toBe('p|k|2026-01-01');
    expect(existingKey('credential', { person_id: 'p', credential_type_id: 't', issued_on: '2026-01-01' })).toBe('p|t|2026-01-01');
  });
});

describe('chunk', () => {
  it('batches at most the given size', () => {
    const xs = Array.from({ length: 1201 }, (_, i) => i);
    expect(chunk(xs, 500).map(c => c.length)).toEqual([500, 500, 201]);
  });
});
