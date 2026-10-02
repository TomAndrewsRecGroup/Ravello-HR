-- ═══════════════════════════════════════════════════════════════════
-- 207: report_share_tokens — Shareable Reports (go-live gap list,
-- item 7, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- `reports` (001, extended by 082/089/108/171) has always needed an
-- authenticated session to view — no way to hand an uploaded report or
-- a generated Value Report to an external party (an insurer, an
-- auditor, a regulator) without giving them a portal/admin login.
--
-- Exactly the `policy_ack_tokens`/`hs_test_tokens`/`worker_qr_tokens`
-- shape: the raw token exists only in the link the creator copies or
-- emails; this table holds its SHA-256 only. RLS on, NO POLICIES —
-- service role only, "fails closed by design," the same posture those
-- three tables already use. Unlike a single-use set-password token, a
-- share link is DURABLE (`worker_qr_tokens`' own model): the recipient
-- may open it more than once before it expires or is revoked, bounded
-- to a hard 90-day maximum lifetime by the table's own CHECK — never
-- an indefinitely-living external link to a client's own document.

CREATE TABLE IF NOT EXISTS public.report_share_tokens (
  token_hash       text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  report_id        uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name  text NOT NULL,
  recipient_note   text CHECK (recipient_note IS NULL OR length(recipient_note) <= 200),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  access_count     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days')
);
CREATE INDEX IF NOT EXISTS report_share_tokens_report_idx ON public.report_share_tokens (report_id);
CREATE INDEX IF NOT EXISTS report_share_tokens_company_idx ON public.report_share_tokens (company_id);

ALTER TABLE public.report_share_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = service role only.
REVOKE ALL ON public.report_share_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.report_share_tokens IS
  'SHA-256 of shareable-report links (go-live gap list, item 7, 207). Service role only: RLS on, no policies.';

-- rls_policy_audit() (080, re-tuned 198) would otherwise flag this
-- table's own RLS-on-no-policies shape as "unreachable" — the exact
-- false positive 198 already fixed for entity_qr_tokens/worker_qr_tokens.
-- Redefined here (latest definition wins, the standing convention for
-- every shared function this codebase extends) with the new table
-- added to the same exemption list, nothing else in the function body
-- changed from 198's own version.
CREATE OR REPLACE FUNCTION public.rls_policy_audit()
 RETURNS TABLE(severity text, table_name text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT 'critical'::text, c.relname::text,
         CASE WHEN NOT c.relrowsecurity
              THEN 'RLS is DISABLED — the anon key can read and write this table'
              ELSE 'RLS enabled but NO policies — the table is unreachable' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  HAVING (NOT c.relrowsecurity OR count(p.polname) = 0)
    AND c.relname NOT IN ('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens')
  UNION ALL
  SELECT 'critical'::text, pol.tablename::text,
         format('policy %L permits ALL rows (%s) — it overrides every stricter policy on this table',
                pol.policyname,
                CASE WHEN pol.qual = 'true' THEN 'USING true' ELSE 'WITH CHECK true' END)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.permissive = 'PERMISSIVE'
    AND (pol.qual = 'true' OR pol.with_check = 'true')
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')
    AND pol.policyname NOT IN (
      'access_capabilities_read', 'access_role_capabilities_read',
      'access_roles_read', 'legacy_role_map_read'
    )
  UNION ALL
  SELECT 'warning'::text, pol.tablename::text,
         format('policy %L has no company, user or staff scoping in its expression', pol.policyname)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.permissive = 'PERMISSIVE'
    AND coalesce(pol.qual, pol.with_check, '') <> ''
    AND coalesce(pol.qual, pol.with_check) !~* '(company_id|is_tps_staff|get_my_role|my_company_id|auth\.uid|user_id|person_visible|is_me\()'
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')
    AND pol.policyname NOT IN (
      'access_capabilities_read', 'access_role_capabilities_read',
      'access_roles_read', 'legacy_role_map_read'
    )
  UNION ALL
  SELECT 'warning'::text, d.tablename::text,
         format('%s permissive %s policies on one table (%s) — a rewrite may not have dropped what it replaced',
                d.n, d.cmd, d.names)
  FROM (
    SELECT tablename, cmd, count(*) AS n,
           string_agg(policyname, ', ' ORDER BY policyname) AS names
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd HAVING count(*) > 2
  ) d
  ORDER BY 1, 2;
$function$;
