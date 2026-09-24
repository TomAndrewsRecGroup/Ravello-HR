// Pins migration 089. The live check is supabase/probes/089_hs_defect_fixes.sql
// (run 2026-09-24 against production, before and after: cross-company
// upload ALLOWED → blocked, own report NOT VISIBLE → ok, client document
// insert and report-by-path insert FAILED → ok). This stops the file
// drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../../../supabase/migrations/089_hs_defect_fixes.sql'),
  'utf8',
);

function policy(name: string): string {
  const start = sql.indexOf(`CREATE POLICY ${name}`);
  expect(start, `089 creates ${name}`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(');', start));
}

describe('089 H&S defect fixes', () => {
  it('drops the upload policy that let any user write into any company folder', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Authenticated upload to documents bucket" ON storage\.objects;/);
    expect(sql).not.toMatch(/CREATE POLICY "Authenticated upload to documents bucket"/);
  });

  it('lets a client upload only into their own company folder', () => {
    const p = policy('documents_client_insert_own_folder');
    expect(p).toMatch(/FOR INSERT TO authenticated/);
    expect(p).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(SELECT public\.my_company_id\(\)\)::text/);
  });

  it('lets a client read reports/<their company>/ and nothing wider', () => {
    const p = policy('documents_client_read_reports');
    expect(p).toMatch(/FOR SELECT TO authenticated/);
    expect(p).toMatch(/\[1\] = 'reports'/);
    expect(p).toMatch(/\[2\] = \(SELECT public\.my_company_id\(\)\)::text/);
  });

  it('lets a client add a document only to their own company, own folder, not pre-approved', () => {
    const p = policy('client_documents_insert');
    expect(p).toMatch(/company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(p).toMatch(/uploaded_by = \(SELECT auth\.uid\(\)\)/);
    expect(p).toMatch(/split_part\(file_path, '\/', 1\) = company_id::text/);
    expect(p).toMatch(/approved_at IS NULL/);
    expect(p).toMatch(/approved_by IS NULL/);
  });

  it('replaces NOT NULL file_url with "a url or a storage key"', () => {
    expect(sql).toMatch(/ALTER TABLE public\.documents ALTER COLUMN file_url DROP NOT NULL/);
    expect(sql).toMatch(/nullif\(file_url, ''\) IS NOT NULL OR nullif\(file_path, ''\) IS NOT NULL/);
    expect(sql).toMatch(/ALTER TABLE public\.reports ALTER COLUMN file_url DROP NOT NULL/);
    expect(sql).toMatch(/nullif\(file_url, ''\) IS NOT NULL OR nullif\(storage_path, ''\) IS NOT NULL/);
  });
});
