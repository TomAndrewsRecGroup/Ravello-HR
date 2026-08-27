import { describe, it, expect } from 'vitest';
import { FILE_KINDS, resolveFileKind, SIGNED_URL_TTL_SECONDS } from '../fileKinds';

describe('resolveFileKind — a query parameter must never name a table', () => {
  it('resolves the three known kinds', () => {
    expect(resolveFileKind('document')?.table).toBe('documents');
    expect(resolveFileKind('report')?.table).toBe('reports');
    expect(resolveFileKind('employee_document')?.table).toBe('employee_documents');
  });

  it('refuses anything not on the list', () => {
    // The whole point: without the allow-list, `kind` reaches a query
    // and one parameter reads any table in the schema.
    for (const bad of ['profiles', 'companies', 'candidates', 'auth.users', '']) {
      expect(resolveFileKind(bad)).toBeNull();
    }
  });

  it('refuses non-strings and prototype keys', () => {
    // `FILE_KINDS[kind]` on a plain object would answer `constructor`
    // and `toString` with a function, which is not a FileKind but is
    // truthy — enough to get past a bare `if (!kind)`.
    for (const bad of [undefined, null, 42, {}, [], 'constructor', '__proto__', 'toString']) {
      expect(resolveFileKind(bad as unknown)).toBeNull();
    }
  });

  it('every kind names a private bucket, never logos', () => {
    // `logos` is the one genuinely public bucket. Signing is pointless
    // there, and listing it here would imply the opposite.
    for (const k of Object.values(FILE_KINDS)) {
      expect(k.bucket).toBe('documents');
    }
  });

  it('every kind names a real column on its table', () => {
    // Verified against the live schema on 2026-08-27. THREE different
    // names for one concept, none of them free to change:
    //   documents.file_path            — predates this work, live writer
    //   reports.storage_path           — added by migration 082
    //   employee_documents.file_storage_path — migration 062
    // A mismatch here signs nothing and 404s, with the row sitting right
    // there — so the names are pinned rather than trusted to a comment.
    expect(FILE_KINDS.document.column).toBe('file_path');
    expect(FILE_KINDS.report.column).toBe('storage_path');
    expect(FILE_KINDS.employee_document.column).toBe('file_storage_path');

    // All three distinct is the point: a copy-paste that gave two tables
    // the same column name is exactly how this breaks.
    const cols = Object.values(FILE_KINDS).map(k => `${k.table}.${k.column}`);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe('signed URL lifetime', () => {
  it('is short enough that a captured URL is stale, long enough to download', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThanOrEqual(60);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });
});
