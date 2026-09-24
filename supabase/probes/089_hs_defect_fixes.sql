-- Probe for 089_hs_defect_fixes. Runs as a real client_admin (and staff)
-- through the `authenticated` role and ends in RAISE, so every change —
-- and, if the migration is pasted above this block, the migration too —
-- is rolled back.
--
-- Expected: the cross-company writes and the pre-approved document read
-- "blocked"; everything else "ok". Before 089 (2026-09-24): "upload into
-- another company's folder" was ALLOWED, "read own report file" found
-- nothing, and every documents insert without file_url failed 23502.

DO $$
DECLARE r text := '';
  client   uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  own_co   uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';
  other_co uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';
  staff    uuid := '3f6b51bb-d9ac-43ef-9252-ff4274143897';
  n int;
BEGIN
  -- a report file staff stored for this client
  INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', 'reports/' || own_co || '/probe.pdf');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', other_co || '/contract/evil.pdf');
        r := r || 'upload into another company''s folder: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'upload into another company''s folder: blocked; '; END;

  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', 'reports/' || own_co || '/forged.pdf');
        r := r || 'upload into own reports folder: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'upload into own reports folder: blocked; '; END;

  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', own_co || '/contract/probe.pdf');
        r := r || 'upload into own folder: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'upload into own folder: FAILED ' || SQLERRM || '; '; END;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'documents' AND name = 'reports/' || own_co || '/probe.pdf';
  r := r || 'read own report file: ' || CASE WHEN n = 1 THEN 'ok' ELSE 'NOT VISIBLE' END || '; ';

  BEGIN INSERT INTO documents (company_id, name, category, file_path, uploaded_by, status, version, requires_approval)
        VALUES (own_co, 'Probe', 'contract', own_co || '/contract/probe.pdf', client, 'active', 1, false);
        r := r || 'add a document (path, no url): ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'add a document (path, no url): FAILED ' || SQLERRM || '; '; END;

  BEGIN INSERT INTO documents (company_id, name, category, file_path, uploaded_by, approved_at)
        VALUES (own_co, 'Probe', 'contract', own_co || '/contract/p2.pdf', client, now());
        r := r || 'add a pre-approved document: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'add a pre-approved document: blocked; '; END;

  BEGIN INSERT INTO documents (company_id, name, category, file_path, uploaded_by)
        VALUES (other_co, 'Probe', 'contract', other_co || '/contract/p3.pdf', client);
        r := r || 'add a document to another company: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'add a document to another company: blocked; '; END;

  BEGIN INSERT INTO documents (company_id, name, category, file_path, uploaded_by)
        VALUES (own_co, 'Probe', 'contract', other_co || '/contract/p4.pdf', client);
        r := r || 'point own document at another company''s file: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'point own document at another company''s file: blocked; '; END;

  BEGIN PERFORM id, notes FROM compliance_items WHERE company_id = own_co LIMIT 1;
        r := r || 'select compliance_items.notes: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'select compliance_items.notes: FAILED ' || SQLERRM || '; '; END;

  -- staff storing a report by path only (ReportUploadForm)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO reports (company_id, title, storage_path, generated_by)
        VALUES (own_co, 'Probe report', 'reports/' || own_co || '/probe.pdf', staff);
        r := r || 'staff add a report (path, no url): ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'staff add a report (path, no url): FAILED ' || SQLERRM || '; '; END;

  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', 'reports/' || own_co || '/staff.pdf');
        r := r || 'staff upload a report file: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'staff upload a report file: FAILED ' || SQLERRM || '; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
