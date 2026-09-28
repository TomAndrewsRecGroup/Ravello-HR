-- Probe for 119 document versioning, run as staff then as a client of
-- the same company. Ends in RAISE: everything is rolled back.
-- Result 2026-09-26: 8/8 PASS.
DO $$
DECLARE r text := ''; n int; co uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82'; d uuid; staff uuid := '7434b282-0b17-4e6f-9fe1-65fb383fb8a5';
  ab uuid := 'e195ab67-b61a-4664-8eb2-c2ae2f8dc4ad';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO documents (company_id, name, category, file_path, version, status, requires_approval)
    VALUES (co, 'Probe versioned policy', 'policy', co::text || '/v1.pdf', 1, 'active', true) RETURNING id INTO d;
  SELECT count(*) INTO n FROM document_versions WHERE document_id = d AND approval_state = 'pending_review';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' insert creates v1 pending review; ';
  UPDATE documents SET file_path = co::text || '/v2.pdf' WHERE id = d;
  UPDATE documents SET file_path = co::text || '/v3.pdf' WHERE id = d;
  SELECT count(*) INTO n FROM document_versions WHERE document_id = d; r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' three files → three versions ('||n||'); ';
  SELECT count(*) INTO n FROM document_versions WHERE document_id = d AND superseded_at IS NULL AND version = 3;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' only v3 current; ';
  SELECT version INTO n FROM documents WHERE id = d; r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' documents.version bumped to 3; ';
  UPDATE documents SET approved_at = now(), approved_by = staff WHERE id = d;
  SELECT count(*) INTO n FROM document_versions WHERE document_id = d AND superseded_at IS NULL AND approval_state = 'approved';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' approval lands on the current version; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ab, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM document_versions WHERE document_id = d; r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' client reads its own version history; ';
  BEGIN UPDATE document_versions SET file_path = 'x' WHERE document_id = d; r := r || 'FAIL client rewrote history; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS client cannot rewrite a version; '; END;
  RESET ROLE;
  DELETE FROM documents WHERE id = d;
  SELECT count(*) INTO n FROM document_versions WHERE company_id = co AND file_path LIKE '%/v_.pdf';
  r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' deleting the document keeps its versions ('||n||'); ';
  RAISE EXCEPTION 'DOC PROBE (rolled back): %', r;
END $$;
