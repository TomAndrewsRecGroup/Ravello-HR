-- Live rolled-back probe for migration 181 (Core-OS 360 Phase 16,
-- Group 1: Cross-Client Lessons Learned Network). Run against project
-- sbmekaviwkiyorvmtgcu inside a BEGIN...ROLLBACK transaction.

BEGIN;

CREATE TEMP TABLE probe_results (n int, check_name text, pass boolean, detail text) ON COMMIT DROP;
GRANT INSERT, SELECT ON probe_results TO authenticated;

DO $$
DECLARE
  co_a uuid; co_b uuid;
  staff_uid uuid; client_a_uid uuid; client_b_uid uuid;
  incident_a uuid;
  lesson1 uuid; lesson2 uuid;
  cnt int;
BEGIN
  INSERT INTO companies (id, name, slug) VALUES (gen_random_uuid(), 'Probe181 Client A', 'probe181-co-a-' || floor(random()*99999)) RETURNING id INTO co_a;
  INSERT INTO companies (id, name, slug) VALUES (gen_random_uuid(), 'Probe181 Client B', 'probe181-co-b-' || floor(random()*99999)) RETURNING id INTO co_b;

  SELECT id INTO staff_uid   FROM auth.users ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO client_a_uid FROM auth.users ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO client_b_uid FROM auth.users ORDER BY id OFFSET 2 LIMIT 1;

  UPDATE profiles SET role = 'tps_admin', company_id = NULL WHERE id = staff_uid;
  UPDATE profiles SET role = 'client_admin', company_id = co_a WHERE id = client_a_uid;
  UPDATE profiles SET role = 'client_admin', company_id = co_b WHERE id = client_b_uid;

  INSERT INTO hs_incidents (id, company_id, incident_type, occurred_on, description, exact_location)
    VALUES (gen_random_uuid(), co_a, 'near_miss', current_date, 'Probe181 source incident', 'Warehouse floor') RETURNING id INTO incident_a;

  PERFORM set_config('probe.co_a', co_a::text, true);
  PERFORM set_config('probe.co_b', co_b::text, true);
  PERFORM set_config('probe.staff_uid', staff_uid::text, true);
  PERFORM set_config('probe.client_a_uid', client_a_uid::text, true);
  PERFORM set_config('probe.client_b_uid', client_b_uid::text, true);
  PERFORM set_config('probe.incident_a', incident_a::text, true);
END $$;

-- ── as STAFF ─────────────────────────────────────────────────────────
DO $$
DECLARE
  staff_uid uuid := current_setting('probe.staff_uid')::uuid;
  incident_a uuid := current_setting('probe.incident_a')::uuid;
  lesson1 uuid; lesson2 uuid; bogus uuid := gen_random_uuid();
  published_at1 timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- check1: a plain draft lesson with no source inserts fine, defaults to draft
  INSERT INTO lessons_learned (title, category, summary) VALUES ('Probe lesson (manual)', 'people', 'A generalised summary.') RETURNING id INTO lesson1;
  INSERT INTO probe_results VALUES (1, 'plain draft lesson inserts, defaults to draft status',
    (SELECT status FROM lessons_learned WHERE id = lesson1) = 'draft', NULL);

  -- check2: an unknown source_type is refused
  BEGIN
    INSERT INTO lessons_learned (title, category, summary, source_type, source_id) VALUES ('Bad source', 'people', 'x', 'not_a_real_type', bogus);
    INSERT INTO probe_results VALUES (2, 'unknown source_type refused', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (2, 'unknown source_type refused', true, NULL);
  END;

  -- check3: a source_id that does not exist is refused
  BEGIN
    INSERT INTO lessons_learned (title, category, summary, source_type, source_id) VALUES ('Bad id', 'people', 'x', 'incident', bogus);
    INSERT INTO probe_results VALUES (3, 'nonexistent source_id refused', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (3, 'nonexistent source_id refused', true, NULL);
  END;

  -- check4: a real incident as source resolves fine
  INSERT INTO lessons_learned (title, category, summary, source_type, source_id) VALUES ('Real source', 'people', 'x', 'incident', incident_a) RETURNING id INTO lesson2;
  INSERT INTO probe_results VALUES (4, 'a real incident source resolves and inserts', lesson2 IS NOT NULL, NULL);

  -- check5: publishing stamps published_at exactly once
  UPDATE lessons_learned SET status = 'published' WHERE id = lesson1;
  SELECT published_at INTO published_at1 FROM lessons_learned WHERE id = lesson1;
  INSERT INTO probe_results VALUES (5, 'publishing stamps published_at', published_at1 IS NOT NULL, NULL);

  UPDATE lessons_learned SET status = 'archived' WHERE id = lesson1;
  UPDATE lessons_learned SET status = 'published' WHERE id = lesson1;
  INSERT INTO probe_results VALUES (6, 'republishing never resets published_at', (SELECT published_at FROM lessons_learned WHERE id = lesson1) = published_at1, NULL);

  -- check7: distributing a DRAFT lesson is refused
  BEGIN
    INSERT INTO lesson_learned_distributions (lesson_id, company_id) VALUES (lesson2, current_setting('probe.co_a')::uuid);
    INSERT INTO probe_results VALUES (7, 'distributing a draft lesson refused', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (7, 'distributing a draft lesson refused', true, NULL);
  END;

  -- check8: publish lesson2, then distribute to Client A only
  UPDATE lessons_learned SET status = 'published' WHERE id = lesson2;
  INSERT INTO lesson_learned_distributions (lesson_id, company_id) VALUES (lesson2, current_setting('probe.co_a')::uuid);
  INSERT INTO probe_results VALUES (8, 'distributing a published lesson succeeds', true, NULL);

  PERFORM set_config('probe.lesson2', lesson2::text, true);

  -- check9: no anon/authenticated EXECUTE on the three new DEFINER functions
  INSERT INTO probe_results VALUES (9, 'no DEFINER function executable by anon',
    NOT has_function_privilege('anon', 'public.lessons_learned_stamp()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.lesson_learned_distributions_fill()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.lesson_learned_reads_fill()', 'EXECUTE'), NULL);

  RESET ROLE;
END $$;

-- ── as CLIENT A (own distributed lesson) ────────────────────────────
DO $$
DECLARE
  client_a_uid uuid := current_setting('probe.client_a_uid')::uuid;
  lesson2 uuid := current_setting('probe.lesson2')::uuid;
  co_a uuid := current_setting('probe.co_a')::uuid;
  seen int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- check10: client A can never read lessons_learned directly — no policy at all
  SELECT count(*) INTO seen FROM lessons_learned WHERE id = lesson2;
  INSERT INTO probe_results VALUES (10, 'client cannot read lessons_learned directly, even a published one distributed to them', seen = 0, NULL);

  -- check11: client A CAN see their own distribution row
  SELECT count(*) INTO seen FROM lesson_learned_distributions WHERE lesson_id = lesson2 AND company_id = co_a;
  INSERT INTO probe_results VALUES (11, 'client sees own distribution row', seen = 1, NULL);

  -- check12: client A can mark it read; derived fields ignore what the caller sends
  INSERT INTO lesson_learned_reads (lesson_id, company_id, read_by, read_by_name)
    VALUES (lesson2, gen_random_uuid(), gen_random_uuid(), 'Spoofed Name');
  SELECT count(*) INTO seen FROM lesson_learned_reads
    WHERE lesson_id = lesson2 AND company_id = co_a AND read_by = client_a_uid AND read_by_name IS DISTINCT FROM 'Spoofed Name';
  INSERT INTO probe_results VALUES (12, 'read receipt derives company_id/read_by from session, ignores caller-supplied values', seen = 1, NULL);

  RESET ROLE;
END $$;

-- ── as CLIENT B (never distributed) ─────────────────────────────────
DO $$
DECLARE
  client_b_uid uuid := current_setting('probe.client_b_uid')::uuid;
  lesson2 uuid := current_setting('probe.lesson2')::uuid;
  co_b uuid := current_setting('probe.co_b')::uuid;
  seen int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_b_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- check13: client B sees no distribution row for the other client's lesson
  SELECT count(*) INTO seen FROM lesson_learned_distributions WHERE lesson_id = lesson2;
  INSERT INTO probe_results VALUES (13, 'client B sees no distribution row for a lesson never shared with them', seen = 0, NULL);

  -- check14: client B cannot mark a not-distributed lesson as read
  BEGIN
    INSERT INTO lesson_learned_reads (lesson_id, company_id, read_by) VALUES (lesson2, co_b, client_b_uid);
    INSERT INTO probe_results VALUES (14, 'client B refused marking a not-distributed lesson as read', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (14, 'client B refused marking a not-distributed lesson as read', true, NULL);
  END;

  RESET ROLE;
END $$;

-- check15/16/17: RLS enabled + write guard present
INSERT INTO probe_results VALUES (15, 'RLS enabled on all three new tables',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lessons_learned'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lesson_learned_distributions'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lesson_learned_reads'::regclass), NULL);

INSERT INTO probe_results VALUES (16, 'write guard (restrictive policies) applied to lesson_learned_reads',
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.lesson_learned_reads'::regclass AND NOT polpermissive) = 3, NULL);

INSERT INTO probe_results VALUES (17, 'no write guard needed on lessons_learned / lesson_learned_distributions (staff-only writes)',
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.lessons_learned'::regclass AND NOT polpermissive) = 0
  AND (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.lesson_learned_distributions'::regclass AND NOT polpermissive) = 0, NULL);

DO $$
DECLARE r record; failed int := 0;
BEGIN
  FOR r IN SELECT * FROM probe_results ORDER BY n LOOP
    RAISE NOTICE '% [%] %  %', r.n, CASE WHEN r.pass THEN 'PASS' ELSE 'FAIL' END, r.check_name, COALESCE(r.detail, '');
    IF NOT r.pass THEN failed := failed + 1; END IF;
  END LOOP;
  IF failed > 0 THEN
    RAISE EXCEPTION '% check(s) FAILED', failed;
  ELSE
    RAISE EXCEPTION 'all % checks passed', (SELECT count(*) FROM probe_results);
  END IF;
END $$;

ROLLBACK;
