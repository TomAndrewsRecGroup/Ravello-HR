-- ═══════════════════════════════════════════════════════════
-- 098: jev_decisions — every typed decision Jev makes, and what a
-- person did with it
-- ═══════════════════════════════════════════════════════════
-- Additive; apply before the PR 2 code deploys.
--
-- Jev (TypeSafe AI) answers typed questions — choice, score, yes/no —
-- with probabilities. It does not write text. Every call this platform
-- makes is recorded here in full (state sent, questions asked, raw
-- response, what was selected, whether the gate held it back, whether
-- anything acted on it), and a form that shows a suggestion writes back
-- what the person chose. That column, human_outcome, is the label
-- stream the eval harness scores against.
--
-- Two writers: the service role (the event consumer, the weekly
-- summary) and a signed-in user through a route under app/api/hs,
-- which may not use the service role — hence the INSERT policy keyed
-- on actor_id = auth.uid(). Clients never read this table.

CREATE TABLE IF NOT EXISTS public.jev_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL,
  company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type   text,
  entity_id     uuid,
  actor_id      uuid,
  actor_kind    text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('system', 'staff', 'provider', 'client')),
  model         text,
  input_hash    text NOT NULL,
  state         jsonb NOT NULL,
  questions     jsonb NOT NULL,
  response      jsonb,
  selected      jsonb,
  confidence    numeric,
  gated         boolean NOT NULL DEFAULT false,
  acted         boolean NOT NULL DEFAULT false,
  acted_on      text,
  human_outcome text CHECK (human_outcome IS NULL OR human_outcome IN ('accepted', 'overridden', 'ignored')),
  status        integer,
  duration_ms   integer,
  error         text,
  input_tokens  integer
);
CREATE INDEX IF NOT EXISTS jev_decisions_kind_idx   ON public.jev_decisions (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS jev_decisions_hash_idx   ON public.jev_decisions (input_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS jev_decisions_entity_idx ON public.jev_decisions (entity_type, entity_id);

ALTER TABLE public.jev_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jev_decisions_staff_read   ON public.jev_decisions;
DROP POLICY IF EXISTS jev_decisions_actor_insert ON public.jev_decisions;
DROP POLICY IF EXISTS jev_decisions_actor_read   ON public.jev_decisions;
DROP POLICY IF EXISTS jev_decisions_outcome      ON public.jev_decisions;

CREATE POLICY jev_decisions_staff_read ON public.jev_decisions
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));
-- The person who asked may read their own decision back (a provider
-- classifying a register item sees the suggestion they were given).
CREATE POLICY jev_decisions_actor_read ON public.jev_decisions
  FOR SELECT TO authenticated USING (actor_id = (SELECT auth.uid()));
CREATE POLICY jev_decisions_actor_insert ON public.jev_decisions
  FOR INSERT TO authenticated WITH CHECK (actor_id = (SELECT auth.uid()));
-- Only the outcome may be written back by a session: the trigger below
-- refuses any other column change from authenticated.
CREATE POLICY jev_decisions_outcome ON public.jev_decisions
  FOR UPDATE TO authenticated
  USING (actor_id = (SELECT auth.uid()) OR (SELECT public.is_tps_staff()))
  WITH CHECK (actor_id = (SELECT auth.uid()) OR (SELECT public.is_tps_staff()));

CREATE OR REPLACE FUNCTION public.jev_decisions_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF to_jsonb(NEW) - 'human_outcome' - 'acted' - 'acted_on' IS DISTINCT FROM to_jsonb(OLD) - 'human_outcome' - 'acted' - 'acted_on' THEN
      RAISE EXCEPTION 'only human_outcome, acted and acted_on may be changed on a jev decision' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jev_decisions_guard ON public.jev_decisions;
CREATE TRIGGER jev_decisions_guard BEFORE UPDATE ON public.jev_decisions
  FOR EACH ROW EXECUTE FUNCTION public.jev_decisions_guard();

REVOKE DELETE, TRUNCATE ON public.jev_decisions FROM PUBLIC, anon, authenticated;
