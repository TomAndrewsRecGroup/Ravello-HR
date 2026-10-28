-- Athletes To Industry: the Thursday 3pm "live roles" email.
--
-- Operator, 2026-10-28: an automated email from the andrews-recruitment
-- address (Tom's own SMTP, migration 073), every Thursday at 15:00 UK
-- time, listing every live Manatal role. It goes to athletes on the
-- Athletes To Industry list ONLY, never to anyone else. Each role links
-- to its page on andrews-recruitment.com (/jobs/<Manatal job id>) and
-- carries a "Match me" button: the athlete confirms on a no-login page
-- and Tom receives an email with their details and the role.
--
-- Shape, and why:
--
-- * Recipients are ONLY ever athletes rows. There is no free-text
--   address anywhere in this schema — a delivery names an athlete and
--   the email it was sent to. `a2i_role_alert_recipients` is the
--   "selected athletes" list used when the config's recipient_mode is
--   'selected'; in 'all' mode every athlete with an email is a
--   recipient.
--
-- * Opt-outs live in their OWN staff-only table, keyed by lower-cased
--   email, never as a column on `athletes`. `athletes_client_rw` (044)
--   lets a client session write its own company's athlete rows, so an
--   opt-out column there could be cleared by a client — re-subscribing
--   someone who asked to stop. Keying by email also means a person who
--   exists as two athlete rows (two referring clients) is opted out of
--   both at once.
--
-- * `a2i_role_alert_sends` is one row per London ISO week (UNIQUE
--   week_key) — the database, not the cron schedule, is what makes the
--   email go out at most once a week. `jobs` is a snapshot of exactly
--   the roles that week's email listed, so the Match me page and Tom's
--   notification describe the role the athlete actually saw, and a
--   resumed run sends the same list it started with.
--
-- * `a2i_role_alert_deliveries` UNIQUE (send_id, email_lower) is the
--   claim-before-send guard: a re-run, a resumed run or a double click
--   of "Send now" can never email the same person twice in one week.
--
-- * `a2i_role_alert_tokens` is the no-login link, the exact
--   policy_ack_tokens (103) / document_signature_tokens (213) shape:
--   SHA-256 only, RLS on with ZERO policies, service role only. Durable
--   (not burned on use) — one token covers Match me on every role in
--   that week's email and the unsubscribe link.
--
-- * `a2i_role_interests` UNIQUE (athlete_id, manatal_job_id): one
--   notification to Tom per athlete per role, however many times the
--   button is pressed or the email is re-opened.
--
-- Every table except the token table is staff-only RLS
-- (is_tps_staff()). The public pages write through the portal's
-- service role from token-gated routes; nothing here is client-
-- or anon-reachable directly. No outbox triggers: every notification
-- this feature sends is sent directly by the route or cron that
-- caused it.
--
-- rls_policy_audit() (080, 198, 216) is updated in this same migration
-- to recognise a2i_role_alert_tokens as a deliberate zero-policy table
-- — the lesson 216 recorded after the audit went stale twice.
--
-- Additive only: no DROP TABLE / DROP FUNCTION (this sandbox's DDL path
-- reliably times out on DROP statements).

-- ─── Config (single row) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_config (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton          boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  enabled            boolean NOT NULL DEFAULT false,
  recipient_mode     text NOT NULL DEFAULT 'all' CHECK (recipient_mode IN ('all', 'selected')),
  sender_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role_url_template  text NOT NULL DEFAULT 'https://www.andrews-recruitment.com/jobs/{id}'
                     CHECK (role_url_template ~ '^https://[^\s]+$'
                            AND position('{id}' IN role_url_template) > 0
                            AND length(role_url_template) <= 300),
  notify_email       text NOT NULL DEFAULT 'tom@andrews-recruitment.com'
                     CHECK (notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(notify_email) <= 254),
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER a2i_role_alert_config_updated_at BEFORE UPDATE ON public.a2i_role_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.a2i_role_alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_alert_config_staff_all ON public.a2i_role_alert_config
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

CREATE OR REPLACE TRIGGER a2i_role_alert_config_audit AFTER INSERT OR UPDATE OR DELETE ON public.a2i_role_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('athlete_role_alert_config', '-',
    'enabled', 'recipient_mode', 'sender_profile_id', 'role_url_template', 'notify_email');

-- Seeded OFF, with Tom's profile (the only one with SMTP configured) as
-- the sender. Nothing sends until a member of staff switches it on.
INSERT INTO public.a2i_role_alert_config (sender_profile_id)
SELECT (SELECT p.id FROM public.profiles p
         WHERE lower(p.email) = 'tom@andrews-recruitment.com' AND p.role = 'tps_admin'
         LIMIT 1)
ON CONFLICT (singleton) DO NOTHING;

-- ─── Selected recipients (recipient_mode = 'selected') ──────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL UNIQUE REFERENCES public.athletes(id) ON DELETE CASCADE,
  added_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.a2i_role_alert_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_alert_recipients_staff_all ON public.a2i_role_alert_recipients
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

CREATE OR REPLACE TRIGGER a2i_role_alert_recipients_audit AFTER INSERT OR UPDATE OR DELETE ON public.a2i_role_alert_recipients
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('athlete_role_alert_recipient', '-', 'athlete_id');

-- ─── Opt-outs (by email) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_optouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_lower  text NOT NULL UNIQUE
               CHECK (email_lower = lower(email_lower) AND length(email_lower) BETWEEN 3 AND 254),
  athlete_id   uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  source       text NOT NULL CHECK (source IN ('link', 'staff')),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.a2i_role_alert_optouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_alert_optouts_staff_all ON public.a2i_role_alert_optouts
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

-- The audit trail records who and how, never the address itself.
CREATE OR REPLACE TRIGGER a2i_role_alert_optouts_audit AFTER INSERT OR UPDATE OR DELETE ON public.a2i_role_alert_optouts
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('athlete_role_alert_optout', '-', 'athlete_id', 'source');

-- ─── Weekly sends ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_sends (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key           text NOT NULL UNIQUE CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sending', 'complete', 'no_roles', 'failed')),
  trigger            text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual')),
  triggered_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_email       text,
  jobs               jsonb,
  job_count          integer NOT NULL DEFAULT 0 CHECK (job_count >= 0),
  recipient_count    integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  sent_count         integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count       integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error              text CHECK (error IS NULL OR length(error) <= 2000),
  alerted_at         timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER a2i_role_alert_sends_updated_at BEFORE UPDATE ON public.a2i_role_alert_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.a2i_role_alert_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_alert_sends_staff_all ON public.a2i_role_alert_sends
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

-- ─── Per-recipient deliveries (the claim-before-send guard) ─────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id       uuid NOT NULL REFERENCES public.a2i_role_alert_sends(id) ON DELETE CASCADE,
  athlete_id    uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  email_lower   text NOT NULL
                CHECK (email_lower = lower(email_lower) AND length(email_lower) BETWEEN 3 AND 254),
  full_name     text CHECK (full_name IS NULL OR length(full_name) <= 300),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  message_id    text,
  error         text CHECK (error IS NULL OR length(error) <= 2000),
  attempted_at  timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (send_id, email_lower)
);
CREATE INDEX IF NOT EXISTS a2i_role_alert_deliveries_status_idx
  ON public.a2i_role_alert_deliveries (send_id, status);
CREATE INDEX IF NOT EXISTS a2i_role_alert_deliveries_athlete_idx
  ON public.a2i_role_alert_deliveries (athlete_id);

ALTER TABLE public.a2i_role_alert_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_alert_deliveries_staff_all ON public.a2i_role_alert_deliveries
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

-- ─── No-login link tokens (service role only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_alert_tokens (
  token_hash   text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  delivery_id  uuid NOT NULL REFERENCES public.a2i_role_alert_deliveries(id) ON DELETE CASCADE,
  send_id      uuid NOT NULL REFERENCES public.a2i_role_alert_sends(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  email_lower  text NOT NULL
               CHECK (email_lower = lower(email_lower) AND length(email_lower) BETWEEN 3 AND 254),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS a2i_role_alert_tokens_delivery_idx ON public.a2i_role_alert_tokens (delivery_id);

ALTER TABLE public.a2i_role_alert_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = service role only.
REVOKE ALL ON public.a2i_role_alert_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.a2i_role_alert_tokens IS
  'SHA-256 of the Thursday role-email links (Match me + unsubscribe). Service role only: RLS on, no policies (217), the policy_ack_tokens (103) shape.';

-- ─── Match me requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.a2i_role_interests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  send_id         uuid REFERENCES public.a2i_role_alert_sends(id) ON DELETE SET NULL,
  manatal_job_id  text NOT NULL CHECK (manatal_job_id ~ '^[0-9]{1,20}$'),
  position_name   text NOT NULL CHECK (length(position_name) BETWEEN 1 AND 300),
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  notified_at     timestamptz,
  notify_error    text CHECK (notify_error IS NULL OR length(notify_error) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, manatal_job_id)
);
CREATE INDEX IF NOT EXISTS a2i_role_interests_created_idx ON public.a2i_role_interests (created_at DESC);

ALTER TABLE public.a2i_role_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY a2i_role_interests_staff_all ON public.a2i_role_interests
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

CREATE OR REPLACE TRIGGER a2i_role_interests_audit AFTER INSERT OR UPDATE OR DELETE ON public.a2i_role_interests
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('athlete_role_interest', '-', 'athlete_id', 'manatal_job_id');

-- ─── rls_policy_audit(): recognise the new zero-policy token table ──
-- Live body (216) read before writing this; the only change is
-- 'a2i_role_alert_tokens' added to the zero-policy exemption list.
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
    AND c.relname NOT IN ('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens', 'document_signature_tokens', 'a2i_role_alert_tokens')
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
    AND coalesce(pol.qual, pol.with_check) !~* '(company_id|is_tps_staff|get_my_role|my_company_id|auth\.uid|user_id|person_visible|is_me\(|is_company_super_user)'
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
