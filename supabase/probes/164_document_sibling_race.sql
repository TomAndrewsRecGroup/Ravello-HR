-- Live probe for migration 164 (Core-OS 360 Phase 5, Group 10 QA fix).
-- Run inside BEGIN/ROLLBACK against project sbmekaviwkiyorvmtgcu — never
-- commit this file's INSERTs.
--
-- This is the concurrency defect the final QA pass's own brief asked
-- for ("two users approving different document versions — only one
-- becomes active"): reproduced BEFORE the fix (both siblings ended up
-- active), fixed, and re-proved after. Uses a real company already in
-- the database (Andrews Recruitment Group).

BEGIN;

CREATE TEMP TABLE probe_results (check_name text, pass boolean, detail text);

-- v1: published straight to active.
INSERT INTO hs_documents (id, company_id, title, category, status)
VALUES ('bbbbbbbb-0001-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Fire Policy', 'hs_fire', 'draft');
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0001-0000-0000-000000000164';

-- Two SIBLING drafts, both superseding v1 — simulating two editors
-- independently starting a new version off the same current document.
INSERT INTO hs_documents (id, company_id, title, category, status, supersedes_id)
VALUES
  ('bbbbbbbb-0002-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Fire Policy v2a', 'hs_fire', 'draft', 'bbbbbbbb-0001-0000-0000-000000000164'),
  ('bbbbbbbb-0003-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Fire Policy v2b', 'hs_fire', 'draft', 'bbbbbbbb-0001-0000-0000-000000000164');

-- Both race to active, sequentially (the closest a single SQL session
-- can get to simulating two concurrent approvers; Postgres serializes
-- concurrent UPDATEs to the same row via row-level locking regardless,
-- so the real risk this probe targets is the ROLL TRIGGER's own logic
-- for two DIFFERENT rows, not row-lock contention on one row).
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0002-0000-0000-000000000164';
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0003-0000-0000-000000000164';

INSERT INTO probe_results VALUES ('check1_v1_superseded',
  (SELECT status = 'superseded' FROM hs_documents WHERE id = 'bbbbbbbb-0001-0000-0000-000000000164'), NULL);

INSERT INTO probe_results VALUES ('check2_only_the_LATEST_activation_is_active',
  (SELECT status FROM hs_documents WHERE id = 'bbbbbbbb-0002-0000-0000-000000000164') = 'superseded'
  AND (SELECT status FROM hs_documents WHERE id = 'bbbbbbbb-0003-0000-0000-000000000164') = 'active',
  (SELECT string_agg(id::text || ':' || status, ', ') FROM hs_documents WHERE id IN ('bbbbbbbb-0002-0000-0000-000000000164','bbbbbbbb-0003-0000-0000-000000000164')));

INSERT INTO probe_results VALUES ('check3_exactly_one_active_in_the_whole_family',
  (SELECT count(*) FROM hs_documents WHERE id IN ('bbbbbbbb-0001-0000-0000-000000000164','bbbbbbbb-0002-0000-0000-000000000164','bbbbbbbb-0003-0000-0000-000000000164') AND status = 'active') = 1, NULL);

-- Sanity: a normal LINEAR chain (v1 -> v2 -> v3, no siblings) must be
-- completely unaffected by this fix.
INSERT INTO hs_documents (id, company_id, title, category, status)
VALUES ('bbbbbbbb-0004-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Chain v1', 'hs_fire', 'draft');
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0004-0000-0000-000000000164';
INSERT INTO hs_documents (id, company_id, title, category, status, supersedes_id)
VALUES ('bbbbbbbb-0005-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Chain v2', 'hs_fire', 'draft', 'bbbbbbbb-0004-0000-0000-000000000164');
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0005-0000-0000-000000000164';
INSERT INTO hs_documents (id, company_id, title, category, status, supersedes_id)
VALUES ('bbbbbbbb-0006-0000-0000-000000000164', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE164 Chain v3', 'hs_fire', 'draft', 'bbbbbbbb-0005-0000-0000-000000000164');
UPDATE hs_documents SET status = 'active' WHERE id = 'bbbbbbbb-0006-0000-0000-000000000164';

INSERT INTO probe_results VALUES ('check4_normal_linear_chain_unaffected',
  (SELECT status FROM hs_documents WHERE id = 'bbbbbbbb-0004-0000-0000-000000000164') = 'superseded'
  AND (SELECT status FROM hs_documents WHERE id = 'bbbbbbbb-0005-0000-0000-000000000164') = 'superseded'
  AND (SELECT status FROM hs_documents WHERE id = 'bbbbbbbb-0006-0000-0000-000000000164') = 'active', NULL);

SELECT * FROM probe_results ORDER BY check_name;

ROLLBACK;
