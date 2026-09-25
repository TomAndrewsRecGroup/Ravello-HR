-- ═══════════════════════════════════════════════════════════
-- 096: platform_events — the outbox every consequence hangs off
-- ═══════════════════════════════════════════════════════════
-- Apply AFTER 096a (the email_log_target values), BEFORE the code
-- that reads it deploys. Additive only; 097 adds the CHECKs once the
-- old writers are gone.
--
-- WHY A TRIGGER OUTBOX. Almost every write in both apps ends in a
-- cache refresh and nothing else: a client raising a role, approving a
-- candidate or a service request; a provider recording a failed check;
-- anything going overdue. Those writes come from browser components,
-- portal and admin routes, service-role routes and providers' raw
-- PostgREST calls. The only place that sees all of them is an AFTER
-- trigger, and the only writer that may notify ANYBODY is one
-- service-role consumer (the portal's own attempt to notify staff could
-- never work: a client's session cannot read staff profiles and the
-- notifications INSERT policy refuses a client writing to a staff user).
--
-- One trigger function, a per-table COLUMN WHITELIST passed as trigger
-- arguments. Only whitelisted columns are copied into the payload, and
-- an UPDATE is recorded only when one of them changed. The whitelist is
-- the privacy boundary — never a salary, an NI number, a note body — and
-- platformEventsSql.test.ts pins that.

-- ── the outbox ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id     uuid,
  actor_kind   text NOT NULL DEFAULT 'system',
  dedupe_key   text,
  claimed_at   timestamptz,
  processed_at timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_events_dedupe_idx ON public.platform_events (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_events_pending_idx ON public.platform_events (id) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_events_company_idx ON public.platform_events (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_entity_idx  ON public.platform_events (entity_type, entity_id);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_events_staff_read ON public.platform_events;
CREATE POLICY platform_events_staff_read ON public.platform_events
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));
-- Sessions never write the outbox: triggers (DEFINER) and the service
-- role do. A client session that could insert an event could make the
-- consumer email anyone.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_events FROM PUBLIC, anon, authenticated;

-- ── the trigger function ───────────────────────────────────────────
-- TG_ARGV = the whitelisted columns. INSERT → 'created' with the
-- whitelisted NEW values; UPDATE → 'updated' only if a whitelisted
-- column changed (payload.changed[] + payload.old{}); DELETE →
-- 'deleted' with the whitelisted OLD values. `to_jsonb(NEW) -> col`
-- tolerates a whitelisted column that does not exist on the table
-- (it reads as null), so a stale whitelist never breaks a write.

CREATE OR REPLACE FUNCTION public.platform_event_row()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cols     text[] := TG_ARGV;
  n        jsonb  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  o        jsonb  := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  src      jsonb  := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  newv     jsonb  := '{}'::jsonb;
  oldv     jsonb  := '{}'::jsonb;
  changed  text[] := '{}';
  c        text;
  ev       text;
  company  uuid;
  row_id   uuid;
BEGIN
  IF TG_TABLE_NAME = 'companies' THEN
    company := (src->>'id')::uuid;
  ELSE
    company := (src->>'company_id')::uuid;
  END IF;
  -- Mid-cascade: the company is going, nothing to record against.
  IF company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = company) THEN
    RETURN NULL;
  END IF;
  BEGIN
    row_id := (src->>'id')::uuid;
  EXCEPTION WHEN others THEN
    row_id := NULL;
  END;

  FOREACH c IN ARRAY cols LOOP
    IF TG_OP <> 'DELETE' THEN newv := newv || jsonb_build_object(c, n->c); END IF;
    IF TG_OP = 'UPDATE' AND (n->c) IS DISTINCT FROM (o->c) THEN
      changed := changed || c;
      oldv := oldv || jsonb_build_object(c, o->c);
    END IF;
    IF TG_OP = 'DELETE' THEN oldv := oldv || jsonb_build_object(c, o->c); END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' AND cardinality(changed) = 0 THEN RETURN NULL; END IF;
  ev := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END;

  INSERT INTO public.platform_events (company_id, entity_type, entity_id, event_type, payload, actor_id, actor_kind)
  VALUES (company, TG_TABLE_NAME, row_id, ev,
          jsonb_build_object('new', newv, 'old', oldv, 'changed', to_jsonb(changed)),
          auth.uid(), public.hs_actor_kind());
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_event_row() FROM PUBLIC, anon, authenticated;

-- ── the consumer's claim ───────────────────────────────────────────
-- SKIP LOCKED so two overlapping cron runs never process one event
-- twice; a lease so a run that died mid-way releases its claim; an
-- attempts cap so a poison event stops after five tries and shows on
-- /automation instead of blocking the queue for ever.

CREATE OR REPLACE FUNCTION public.claim_platform_events(p_limit integer, p_lease interval)
RETURNS SETOF public.platform_events
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.platform_events e
     SET claimed_at = now(), attempts = e.attempts + 1
   WHERE e.id IN (
     SELECT id FROM public.platform_events
      WHERE processed_at IS NULL
        AND attempts < 5
        AND (claimed_at IS NULL OR claimed_at < now() - p_lease)
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT greatest(1, least(p_limit, 500))
   )
  RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.claim_platform_events(integer, interval) FROM PUBLIC, anon, authenticated;

-- ── which tables emit, and which columns they may carry ───────────
-- Add a line here AND to TRIGGERED_ENTITIES in lib/events/types.ts;
-- the test pins the two lists against each other. Never whitelist
-- salary, ni_number, tax_code, date_of_birth, leave_token, details,
-- description, notes or body.

DROP TRIGGER IF EXISTS service_requests_platform_event ON public.service_requests;
CREATE TRIGGER service_requests_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','request_type','urgency','subject','submitted_by','responded_at');

DROP TRIGGER IF EXISTS absence_records_platform_event ON public.absence_records;
CREATE TRIGGER absence_records_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.absence_records
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','employee_id','employee_name','absence_type','start_date','end_date','days');

DROP TRIGGER IF EXISTS actions_platform_event ON public.actions;
CREATE TRIGGER actions_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','priority','action_type','title','source_ref','related_entity_type','related_entity_id');

DROP TRIGGER IF EXISTS internal_tasks_platform_event ON public.internal_tasks;
CREATE TRIGGER internal_tasks_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.internal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','assigned_to','title','due_date','priority');

DROP TRIGGER IF EXISTS documents_platform_event ON public.documents;
CREATE TRIGGER documents_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('category','name','review_due_at','approved_at','uploaded_by');

DROP TRIGGER IF EXISTS employee_documents_platform_event ON public.employee_documents;
CREATE TRIGGER employee_documents_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','doc_type','title','expiry_date','employee_name');

DROP TRIGGER IF EXISTS policy_acknowledgements_platform_event ON public.policy_acknowledgements;
CREATE TRIGGER policy_acknowledgements_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.policy_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','document_id','employee_id','acknowledged_at');

DROP TRIGGER IF EXISTS performance_reviews_platform_event ON public.performance_reviews;
CREATE TRIGGER performance_reviews_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','review_type','due_date','employee_name');

DROP TRIGGER IF EXISTS requisitions_platform_event ON public.requisitions;
CREATE TRIGGER requisitions_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('stage','title','assigned_recruiter','submitted_by');

DROP TRIGGER IF EXISTS candidates_platform_event ON public.candidates;
CREATE TRIGGER candidates_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('client_status','approved_for_client','requisition_id','full_name');

DROP TRIGGER IF EXISTS offers_platform_event ON public.offers;
CREATE TRIGGER offers_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','candidate_id','requisition_id','deadline');

DROP TRIGGER IF EXISTS compliance_items_platform_event ON public.compliance_items;
CREATE TRIGGER compliance_items_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','domain','category','title','due_date','source','provider_id');

DROP TRIGGER IF EXISTS hs_register_completions_platform_event ON public.hs_register_completions;
CREATE TRIGGER hs_register_completions_platform_event AFTER INSERT ON public.hs_register_completions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('outcome','item_id','completed_on','provider_id');

DROP TRIGGER IF EXISTS hs_activities_platform_event ON public.hs_activities;
CREATE TRIGGER hs_activities_platform_event AFTER INSERT ON public.hs_activities
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('activity_type','title','occurred_on','provider_id');

DROP TRIGGER IF EXISTS hs_files_platform_event ON public.hs_files;
CREATE TRIGGER hs_files_platform_event AFTER INSERT ON public.hs_files
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('entity_type','entity_id','file_name','provider_id');

DROP TRIGGER IF EXISTS hs_provider_companies_platform_event ON public.hs_provider_companies;
CREATE TRIGGER hs_provider_companies_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.hs_provider_companies
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','provider_id','ends_on','scopes');

DROP TRIGGER IF EXISTS onboarding_instances_platform_event ON public.onboarding_instances;
CREATE TRIGGER onboarding_instances_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_instances
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','employee_id','template_id');

DROP TRIGGER IF EXISTS onboarding_task_progress_platform_event ON public.onboarding_task_progress;
CREATE TRIGGER onboarding_task_progress_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_task_progress
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','instance_id','task_title','due_date');

DROP TRIGGER IF EXISTS offboarding_instances_platform_event ON public.offboarding_instances;
CREATE TRIGGER offboarding_instances_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.offboarding_instances
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','employee_id','last_working_day','reason');

DROP TRIGGER IF EXISTS offboarding_task_progress_platform_event ON public.offboarding_task_progress;
CREATE TRIGGER offboarding_task_progress_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.offboarding_task_progress
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','instance_id','task_title','due_date');

DROP TRIGGER IF EXISTS employee_records_platform_event ON public.employee_records;
CREATE TRIGGER employee_records_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','start_date','end_date','probation_end','full_name','job_title','department');

DROP TRIGGER IF EXISTS companies_platform_event ON public.companies;
CREATE TRIGGER companies_platform_event AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('subscription_status');

DROP TRIGGER IF EXISTS enquiries_platform_event ON public.enquiries;
CREATE TRIGGER enquiries_platform_event AFTER INSERT OR UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','source','company_name');

DROP TRIGGER IF EXISTS bd_companies_platform_event ON public.bd_companies;
CREATE TRIGGER bd_companies_platform_event AFTER INSERT OR UPDATE ON public.bd_companies
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status');

-- ── notifications: dedupe, email claim, own-row delete, realtime ───

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_id   bigint;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unemailed_idx ON public.notifications (user_id, created_at DESC) WHERE emailed_at IS NULL AND read = false;

-- The admin bell's "clear read" deleted nothing: no DELETE policy.
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Both bells subscribe to postgres_changes on notifications, and the
-- Enquiries button on enquiries. The live publication had NO tables,
-- so neither subscription had ever delivered anything. RLS still
-- filters what each subscriber receives.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'enquiries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.enquiries;
  END IF;
END $$;

-- ── email_log: a claim key for consumer-sent emails ────────────────
-- An email consequence with no notification row (the raiser's own
-- acknowledgement, an employee's leave decision) claims by inserting
-- its email_log row FIRST under a dedupe key, then sends, then fills
-- in the outcome. A re-processed event finds the key and sends nothing.

ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS email_log_dedupe_idx ON public.email_log (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ── notification preferences (replaces the localStorage checkboxes) ─

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_mode     text NOT NULL DEFAULT 'immediate' CHECK (email_mode IN ('immediate', 'daily', 'off')),
  muted_types    text[] NOT NULL DEFAULT '{}',
  weekly_summary boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_preferences_own   ON public.notification_preferences;
DROP POLICY IF EXISTS notification_preferences_staff ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_staff ON public.notification_preferences
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));

-- ── actions / internal_tasks: idempotent creation by the consumer ──
-- An event re-processed after a crash must not raise a second action.

ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS source_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS actions_source_ref_idx ON public.actions (company_id, source_ref) WHERE source_ref IS NOT NULL;
-- The column default was 'medium', a value the portal renders but the
-- Broadcast page, the BD convert route and statusMaps never used; the
-- one vocabulary is low | normal | high | urgent (097 adds the CHECK).
ALTER TABLE public.actions ALTER COLUMN priority SET DEFAULT 'normal';
UPDATE public.actions SET priority = 'normal' WHERE priority = 'medium';

ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS source_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS internal_tasks_source_ref_idx ON public.internal_tasks (source_ref) WHERE source_ref IS NOT NULL;

-- ── automation_runs: one row per cron run, refused ones included ───

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job         text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome     text NOT NULL CHECK (outcome IN ('ok', 'degraded', 'error', 'disabled', 'unauthorized')),
  tally       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text
);
CREATE INDEX IF NOT EXISTS automation_runs_job_idx ON public.automation_runs (job, started_at DESC);
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_staff_read ON public.automation_runs;
CREATE POLICY automation_runs_staff_read ON public.automation_runs
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.automation_runs FROM PUBLIC, anon, authenticated;

-- ── X8: a FAILED H&S check no longer rolls the register forward ────
-- 095's hs_completion_roll ignored `outcome`, so recording a failed
-- fire-alarm test set last_completed_on and pushed due_date a year
-- out — the register showed "on track" for the exact item that had
-- just failed. A fail now marks the item in_review and leaves the due
-- date and last (satisfactory) completion where they were.

CREATE OR REPLACE FUNCTION public.hs_completion_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.outcome = 'fail' THEN
    UPDATE public.compliance_items ci
       SET status = 'in_review'::compliance_status, updated_at = now()
     WHERE ci.id = NEW.item_id;
    RETURN NULL;
  END IF;
  UPDATE public.compliance_items ci
     SET last_completed_on = NEW.completed_on,
         due_date   = coalesce(NEW.next_due_on, ci.due_date),
         status     = CASE WHEN NEW.next_due_on IS NULL THEN 'complete'::compliance_status ELSE 'pending'::compliance_status END,
         updated_at = now()
   WHERE ci.id = NEW.item_id
     AND (ci.last_completed_on IS NULL OR ci.last_completed_on <= NEW.completed_on);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_completion_roll() FROM PUBLIC, anon, authenticated;
