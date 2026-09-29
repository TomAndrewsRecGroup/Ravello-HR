// Pins migration 160 (Core-OS 360 Phase 5, Group 5: Controlled Document
// Management). The live database is the real check
// (supabase/probes/160_document_control.sql, 16/16 PASS); this stops the
// migration file drifting from what was applied and pins the properties
// that, if lost, would silently let a document publish without review,
// let someone approve their own work, or let an edit overwrite an
// approved version's content.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/160_document_control.sql'), 'utf8');

describe('Controlled Document Management (160)', () => {
  it('every INSERT is forced to draft, whatever the caller sends (rule 2)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_lifecycle_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard'));
    expect(fn).toMatch(/IF TG_OP = 'INSERT' THEN[\s\S]*?NEW\.status\s*:= 'draft';/);
  });

  it('content (title/category/description) is immutable once approved/active/review_due/superseded/withdrawn/archived (rule 5)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_lifecycle_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard'));
    expect(fn).toMatch(/OLD\.status IN \('approved', 'active', 'review_due', 'superseded', 'withdrawn', 'archived'\)/);
    expect(fn).toMatch(/This version is approved and its content is immutable; create a new version instead/);
    // review_due_at is NOT in the immutability check's column list.
    const guardBlock = fn.slice(fn.indexOf("OLD.status IN ('approved'"), fn.indexOf('END IF;'));
    expect(guardBlock).not.toMatch(/review_due_at/);
  });

  it('a document naming a reviewer cannot skip straight to pending_approval (rule 3)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_lifecycle_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard'));
    expect(fn).toMatch(/IF OLD\.status = 'draft' AND NEW\.reviewer_id IS NOT NULL THEN\s+RAISE EXCEPTION 'This document names a reviewer/);
  });

  it('nobody approves their own work — a bare auth.uid() comparison, no staff exemption (rule 4)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_lifecycle_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard'));
    expect(fn).toMatch(/IF auth\.uid\(\) = NEW\.author_id OR auth\.uid\(\) = NEW\.reviewer_id THEN/);
    // The trap this migration's own history records twice already
    // (144a/147a and 105's own note on hs_doc_guard's staff exemption):
    // hs_documents is staff-only end to end, so an is_tps_staff()
    // exemption here would exempt every possible writer.
    expect(fn).not.toMatch(/is_tps_staff\(\)/);
  });

  it('approver_id can never equal author_id or reviewer_id on the same row (rule 4, data level)', () => {
    expect(sql).toMatch(/CONSTRAINT hs_documents_approver_distinct CHECK \(\s*\(approver_id IS NULL OR approver_id <> author_id\)\s*AND \(approver_id IS NULL OR reviewer_id IS NULL OR approver_id <> reviewer_id\)\s*\)/);
  });

  it('active may only be reached when effective_from is null or already past (rule 6)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_lifecycle_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_lifecycle_guard'));
    expect(fn).toMatch(/IF NEW\.effective_from IS NOT NULL AND NEW\.effective_from > current_date THEN/);
  });

  it('the extended lifecycle CHECK is the exact nine-value vocabulary', () => {
    expect(sql).toMatch(/ADD CONSTRAINT hs_documents_status_check CHECK \(status IN \(\s*'draft', 'pending_review', 'pending_approval', 'approved', 'active',\s*'review_due', 'superseded', 'withdrawn', 'archived'\s*\)\)/);
  });

  it('superseding the OLDER version happens only when the NEW version reaches active — never at draft time (rule 7)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_supersede_roll'));
    expect(fn).toMatch(/IF NEW\.status = 'active' AND OLD\.status IS DISTINCT FROM 'active' AND NEW\.supersedes_id IS NOT NULL THEN/);
    expect(fn).toMatch(/SET status = 'superseded'/);
  });

  it('no DELETE is ever granted, and no ALTER re-adds it (rule 8: no auto-delete)', () => {
    expect(sql).not.toMatch(/GRANT DELETE/i);
    expect(sql).not.toMatch(/\bDELETE FROM public\.hs_documents\b/);
  });

  it('retention_period_months is metadata only — computed, never a trigger for deletion', () => {
    expect(sql).toMatch(/retention_until := \(NEW\.approved_at::date \+ \(NEW\.retention_period_months \|\| ' months'\)::interval\)::date/);
    // No statement anywhere in this migration deletes an hs_documents
    // row (checked separately, exhaustively, by the "no DELETE grant"
    // test above) — retention_until is read by nothing that acts on it.
    expect(sql).not.toMatch(/DELETE FROM public\.hs_documents/);
  });

  it('policy_acknowledgements gains hs_document_id, and exactly one of document_id/hs_document_id may be set (rule 9)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.policy_acknowledgements ALTER COLUMN document_id DROP NOT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS hs_document_id uuid REFERENCES public\.hs_documents\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/CONSTRAINT policy_acknowledgements_doc_xor_hsdoc CHECK \(\s*\(document_id IS NOT NULL AND hs_document_id IS NULL\) OR \(document_id IS NULL AND hs_document_id IS NOT NULL\)\s*\)/);
  });

  it('a unique (hs_document_id, employee_id) index exists, mirroring the document_id one', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS policy_acknowledgements_hsdoc_employee_uidx\s+ON public\.policy_acknowledgements \(hs_document_id, employee_id\) WHERE hs_document_id IS NOT NULL/);
  });

  it('RLS is unchanged — no new policy on hs_documents (rule 10)', () => {
    expect(sql).not.toMatch(/CREATE POLICY/);
  });

  it('every new SECURITY DEFINER function is revoked from PUBLIC, anon and authenticated', () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([^)]*\)\s*\nRETURNS trigger[\s\S]*?SECURITY DEFINER/g)].map(m => m[1]);
    expect(definers).toEqual(expect.arrayContaining(['hs_document_lifecycle_guard', 'hs_document_supersede_roll', 'hs_document_event']));
    for (const f of definers) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the outbox whitelist never carries description (free text)', () => {
    const trig = sql.slice(sql.indexOf('CREATE TRIGGER hs_documents_platform_event'), sql.indexOf(';', sql.indexOf('CREATE TRIGGER hs_documents_platform_event')));
    expect(trig).not.toMatch(/description/);
  });

  it('the audit trail whitelist never carries description', () => {
    const trig = sql.slice(sql.indexOf('CREATE TRIGGER hs_documents_audit'), sql.indexOf(';', sql.indexOf('CREATE TRIGGER hs_documents_audit')));
    expect(trig).not.toMatch(/description/);
  });
});
