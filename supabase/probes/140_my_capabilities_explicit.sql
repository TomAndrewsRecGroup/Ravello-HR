-- Migration 140 probe (my_capabilities honours explicit-only), 2026-09-28.
-- Rolled back by the RAISE. Recorded against the applied migration:
--   staff: clinical.read = false (was true before 140); OH advisor with an
--   explicit grant: clinical.read = true. (Staff also reported
--   workforce.manage = false: this staff login had no active organisation,
--   and my_capabilities() has always been scoped to my_company_id() — the
--   Phase 1 rule, unchanged here.)
DO $$
DECLARE stf uuid; a uuid := gen_random_uuid(); home uuid := gen_random_uuid(); oh uuid := gen_random_uuid(); s1 text; s2 text;
BEGIN
  SELECT id INTO stf FROM profiles WHERE role = 'tps_admin' LIMIT 1;
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a,'P140 A','p140a-'||left(a::text,8),'direct_client',true),(home,'P140 H','p140h-'||left(home::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (oh,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p140-oh@probe.invalid','',now(),now(),now(),'{}','{}');
  UPDATE profiles SET role='client_user', company_id=home WHERE id=oh;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (oh, a, 'occupational_health_advisor');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (oh, a);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stf, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  s1 := (SELECT 'occupational_health.clinical.read' = ANY (public.my_capabilities()))::text;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', oh, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  s2 := (SELECT 'occupational_health.clinical.read' = ANY (public.my_capabilities()))::text;
  RESET ROLE;
  RAISE EXCEPTION 'PROBE 140: staff clinical=% (want false); OH advisor clinical=% (want true)', s1, s2;
END $$;
