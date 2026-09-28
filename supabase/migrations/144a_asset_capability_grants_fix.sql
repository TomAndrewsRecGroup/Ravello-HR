-- Rewrites 144's capability-grant INSERT to match 122's VALUES/unnest
-- shape exactly (rather than a dynamic copy-from-existing-grants SELECT),
-- so tenancySql.test.ts's regex-driven TS<->SQL parity check can parse
-- it. Idempotent: ON CONFLICT DO NOTHING against grants 144 already
-- inserted with identical effective role sets — verified live afterward
-- that the resulting grants are byte-identical to risk.read/risk.create's
-- own role sets.

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('asset.read',   ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager','read_only']),
  ('asset.manage', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;
