-- ═══════════════════════════════════════════════════════════════════
-- 179: Worker QR System — Phase 14, Group 1
-- ═══════════════════════════════════════════════════════════════════
--
-- A durable, revocable QR code per worker. Scanning it opens a no-login
-- page showing a COARSE Safe to Deploy status — never the detailed
-- reasons/requirements person_deployment_status() returns, which name
-- exactly which mandatory item is missing (an HR/compliance detail
-- nobody intended to be readable by anyone who photographs or shares a
-- badge). See docs/CORE_OS_360_PHASE14_PLAN.md for the full reasoning.
--
-- The one deliberate departure from every other token table in this
-- codebase (profile_access_tokens/091, policy_ack_tokens/103,
-- hs_test_tokens/116): this token is DURABLE, not single-use. A badge
-- must be re-scannable indefinitely. What stays the same: SHA-256 hash
-- only stored, RLS on with NO session policies at all (service role
-- only), and at most one ACTIVE token per person, enforced by a
-- partial unique index — a lost badge is REVOKED, never deleted (so
-- the audit trail still shows it existed), and a fresh one minted.
--
-- worker_qr_status() bypasses person_deployment_status()/person_
-- visible() entirely, on purpose: both require a real, visible-to-the-
-- caller session, which an anonymous badge scan has none of.
-- Authorisation here is the TOKEN itself — possession of a valid,
-- unrevoked row naming this person is the proof, exactly the model
-- hs_test_tokens/policy_ack_tokens already established for a different
-- no-login artefact. It is SECURITY DEFINER so it may call the
-- otherwise-locked-down _wf_deployment_safe() the same way person_
-- deployment_status()/workforce_readiness() already do (both are
-- themselves SECURITY DEFINER, owned by the same role, which is why
-- the call succeeds despite _wf_deployment_safe()'s own blanket
-- REVOKE ALL ... FROM PUBLIC, anon, authenticated) — never granted to
-- anon or authenticated, only to service_role, since the public route
-- calls it with the service-role client after its OWN token-hash
-- lookup, matching the org_user_ids_with_capability/audit_log/
-- prune_latest_updates precedent for a service-role-only helper.
--
-- site_checkins is attendance, not compliance: it records presence
-- only and never feeds, or is fed by, the Safe to Deploy engine. A
-- NOT_READY worker can still be checked in — this system reports
-- facts, it does not gate access (contractor_worker_access(), Phase 4,
-- already does that, for contractors specifically; untouched here).
-- Its mutations happen ONLY through the public, token-gated scan route
-- (service role, bypassing RLS) — there is deliberately no session
-- write policy, so a portal user cannot check someone in/out by hand
-- without the badge; flagged in the plan doc as debt, not built here.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── worker_qr_tokens ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.worker_qr_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS worker_qr_tokens_person_idx ON public.worker_qr_tokens (person_id);
-- At most one ACTIVE badge per person — a DB-enforced fact, not just
-- app logic. Regenerating (a lost badge) revokes the old row first.
CREATE UNIQUE INDEX IF NOT EXISTS worker_qr_tokens_one_active_per_person
  ON public.worker_qr_tokens (person_id) WHERE revoked_at IS NULL;

-- company_id is derived from the person, never trusted from the
-- caller — the same "person_id filled from parent, never trusted"
-- discipline every H&S sub-record trigger already uses.
CREATE OR REPLACE FUNCTION public.worker_qr_tokens_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.people WHERE id = NEW.person_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'worker_qr_tokens: unknown person_id';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.worker_qr_tokens_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS worker_qr_tokens_fill ON public.worker_qr_tokens;
CREATE TRIGGER worker_qr_tokens_fill BEFORE INSERT ON public.worker_qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.worker_qr_tokens_fill();

ALTER TABLE public.worker_qr_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = service role only —
-- the exact policy_ack_tokens/hs_test_tokens posture, applied here
-- even though this token is durable rather than single-use.
REVOKE ALL ON public.worker_qr_tokens FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS worker_qr_tokens_audit ON public.worker_qr_tokens;
CREATE TRIGGER worker_qr_tokens_audit AFTER INSERT OR UPDATE ON public.worker_qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('worker_qr_token', 'company_id', 'person_id', 'revoked_at');

-- ── worker_qr_status() — the ONE public read, token-gated ───────────

CREATE OR REPLACE FUNCTION public.worker_qr_status(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t record; p record; result jsonb;
BEGIN
  SELECT * INTO t FROM public.worker_qr_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND OR t.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT id, full_name, job_title, company_id, site_id INTO p FROM public.people WHERE id = t.person_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- _wf_deployment_safe() ALWAYS returns REVIEW_REQUIRED on any internal
  -- error (its own EXCEPTION WHEN OTHERS branch) — the engine's own
  -- "never a stale READY" default. Only its `status` field is exposed
  -- here; reasons/requirements stay internal (see this migration's own
  -- header comment).
  result := public._wf_deployment_safe(p.id, public.workforce_today());

  RETURN jsonb_build_object(
    'ok', true,
    'full_name', p.full_name,
    'job_title', p.job_title,
    'company_name', (SELECT name FROM public.companies WHERE id = p.company_id),
    'site_name', (SELECT name FROM public.hs_sites WHERE id = p.site_id),
    'status', result->>'status'
  );
END $$;
REVOKE ALL ON FUNCTION public.worker_qr_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_qr_status(text) TO service_role;

-- ── site_checkins ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_checkins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id        uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  site_id          uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  checked_in_at    timestamptz NOT NULL DEFAULT now(),
  checked_out_at   timestamptz,
  recorded_via     text NOT NULL DEFAULT 'qr_scan' CHECK (recorded_via IN ('qr_scan')),
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at)
);
CREATE INDEX IF NOT EXISTS site_checkins_company_idx ON public.site_checkins (company_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS site_checkins_person_idx ON public.site_checkins (person_id);
-- At most one OPEN check-in per person — a repeated scan while still
-- on site is a no-op the route reports, never a second open row.
CREATE UNIQUE INDEX IF NOT EXISTS site_checkins_one_open_per_person
  ON public.site_checkins (person_id) WHERE checked_out_at IS NULL;

CREATE OR REPLACE FUNCTION public.site_checkins_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.people WHERE id = NEW.person_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'site_checkins: unknown person_id';
  END IF;
  IF NEW.site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hs_sites WHERE id = NEW.site_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'site_checkins: site does not belong to this person''s organisation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.site_checkins_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS site_checkins_fill ON public.site_checkins;
CREATE TRIGGER site_checkins_fill BEFORE INSERT ON public.site_checkins
  FOR EACH ROW EXECUTE FUNCTION public.site_checkins_fill();

ALTER TABLE public.site_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_checkins FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS site_checkins_staff_all ON public.site_checkins;
CREATE POLICY site_checkins_staff_all ON public.site_checkins FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Read-only for a client session, gated on the same broad "can see the
-- workforce" capability the rest of Phase 3 already uses — no client
-- write policy at all: check-in/out is exclusively the public,
-- token-gated scan route (service role), never a hand-typed portal
-- action (flagged as debt in the plan doc, not built here).
DROP POLICY IF EXISTS site_checkins_client_read ON public.site_checkins;
CREATE POLICY site_checkins_client_read ON public.site_checkins FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.has_capability((SELECT public.my_company_id()), 'workforce.read'))
  );

DROP TRIGGER IF EXISTS site_checkins_audit ON public.site_checkins;
CREATE TRIGGER site_checkins_audit AFTER INSERT OR UPDATE ON public.site_checkins
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('site_checkin', 'company_id', 'person_id', 'site_id', 'checked_in_at', 'checked_out_at');
