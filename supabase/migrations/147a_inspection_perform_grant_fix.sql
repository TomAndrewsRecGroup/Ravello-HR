-- Rewrites 147's capability-grant INSERT to match 122/144's VALUES/
-- unnest shape exactly, so tenancySql.test.ts's regex-driven TS<->SQL
-- parity check can parse it. Idempotent: ON CONFLICT DO NOTHING against
-- grants 147 already inserted with identical effective role sets —
-- verified live afterward that the resulting grants are byte-identical
-- to the intended role list.

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('inspection.perform', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','employee'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;
