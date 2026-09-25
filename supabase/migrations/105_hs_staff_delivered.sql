-- ═══════════════════════════════════════════════════════════
-- 105: Health & Safety becomes staff-delivered
-- ═══════════════════════════════════════════════════════════
-- Additive-in-spirit but genuinely destructive: applied live BEFORE the
-- code deploys, and only because the live tables it drops hold zero
-- rows (verified 2026-09-25: hs_providers 0, hs_provider_companies 0,
-- profiles WHERE role='hs_provider' 0, every *.provider_id column 0
-- non-null). If this is ever re-run against a database that has real
-- provider data, STOP and re-derive this migration from that data first.
--
-- Operator, 2026-09-25: H&S is not external providers logging in — it
-- is Core OS 360 staff delivering H&S to clients directly, the same way
-- staff already deliver HR and Recruitment (Peninsula's model: HR,
-- employment law and H&S all delivered by the provider's own staff).
-- The register/completions/activities/files/timeline DATA MODEL
-- (compliance_items.domain='hs', hs_register_completions, hs_activities,
-- hs_files, hs_events) is unchanged and provider-agnostic underneath —
-- only the ACCESS-CONTROL layer (hs_providers, hs_provider_companies,
-- hs_can_access/hs_can_write, my_hs_provider_id, hs_actor_kind's
-- 'provider' branch, profiles.hs_provider_id + its shape CHECK) and the
-- provider-specific columns/UI go.
--
-- The `hs_provider` value stays in the user_role enum (Postgres cannot
-- drop an enum value without a full type rebuild) and 'provider' stays
-- in the platform_events/jev_decisions actor_kind CHECK and the
-- email_log_target enum — both are harmless history for any old row,
-- and nothing will write either value again.

-- ── RLS: drop every provider-branch policy before the functions they
--    call and the tables they read disappear ──────────────────────

DROP POLICY IF EXISTS hs_sites_provider_read   ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_provider_insert ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_provider_update ON public.hs_sites;

DROP POLICY IF EXISTS compliance_items_provider_read   ON public.compliance_items;
DROP POLICY IF EXISTS compliance_items_provider_insert ON public.compliance_items;
DROP POLICY IF EXISTS compliance_items_provider_update ON public.compliance_items;

DROP POLICY IF EXISTS hs_completions_provider_read   ON public.hs_register_completions;
DROP POLICY IF EXISTS hs_completions_provider_insert ON public.hs_register_completions;

DROP POLICY IF EXISTS hs_activities_provider_read   ON public.hs_activities;
DROP POLICY IF EXISTS hs_activities_provider_insert ON public.hs_activities;

DROP POLICY IF EXISTS hs_files_provider_read   ON public.hs_files;
DROP POLICY IF EXISTS hs_files_provider_insert ON public.hs_files;

DROP POLICY IF EXISTS hs_events_provider_read ON public.hs_events;

DROP POLICY IF EXISTS hs_evidence_provider_read   ON storage.objects;
DROP POLICY IF EXISTS hs_evidence_provider_insert ON storage.objects;

-- ── profiles: drop the provider-login shape entirely ────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_hs_provider_shape;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS hs_provider_id;

-- ── drop provider_id from every H&S table it was stamped onto ───────
-- (drop the column, and with it the FK to hs_providers, BEFORE the
-- table itself is dropped below)

ALTER TABLE public.compliance_items         DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.hs_register_completions  DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.hs_activities            DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.hs_files                 DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.hs_events                DROP COLUMN IF EXISTS provider_id;

-- ── redefine the triggers/functions that stamped provider_id ────────

-- hs_log() itself called my_hs_provider_id() for every timeline row.
CREATE OR REPLACE FUNCTION public.hs_log(
  p_company uuid, p_entity_type text, p_entity_id uuid, p_event text, p_summary text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN RETURN; END IF;
  INSERT INTO public.hs_events (company_id, entity_type, entity_id, event_type, summary, actor_id, actor_kind)
  VALUES (p_company, p_entity_type, p_entity_id, p_event, left(p_summary, 500), auth.uid(), public.hs_actor_kind());
END;
$$;

-- Who is acting, for the timeline: 'staff' | 'client' | 'system'. The
-- 'provider' branch is gone; a client is anyone signed in who isn't staff.
CREATE OR REPLACE FUNCTION public.hs_actor_kind()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL     THEN 'system'
           WHEN public.is_tps_staff()  THEN 'staff'
           ELSE 'client'
         END;
$$;

-- A register item's provenance is history, not something a later
-- non-staff editor sets. No provider branch left to stamp on insert.
CREATE OR REPLACE FUNCTION public.hs_register_item_stamp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND public.hs_actor_kind() <> 'staff' AND auth.uid() IS NOT NULL THEN
    NEW.source := OLD.source;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hs_completion_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE it record;
BEGIN
  SELECT company_id, domain, recurrence_every, recurrence_unit INTO it
    FROM public.compliance_items WHERE id = NEW.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register item not found' USING ERRCODE = '23503';
  END IF;
  IF it.domain <> 'hs' THEN
    RAISE EXCEPTION 'Only Health & Safety register items take completions' USING ERRCODE = '23514';
  END IF;
  NEW.company_id       := it.company_id;
  NEW.next_due_on      := public.hs_next_due(NEW.completed_on, it.recurrence_every, it.recurrence_unit);
  NEW.recorded_by      := auth.uid();
  NEW.recorded_by_kind := public.hs_actor_kind();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hs_stamp_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.recorded_by      := auth.uid();
  NEW.recorded_by_kind := public.hs_actor_kind();
  RETURN NEW;
END;
$$;

-- ── drop the provider tables (and everything attached to them) ──────

DROP TABLE IF EXISTS public.hs_provider_companies CASCADE;
DROP FUNCTION IF EXISTS public.hs_event_assignment();
DROP TABLE IF EXISTS public.hs_providers CASCADE;

-- ── drop the access-control functions no session calls any more ─────
-- hs_scope_for_entity and hs_next_due stay: the first still validates
-- hs_files.entity_type, the second still computes recurrence.

DROP FUNCTION IF EXISTS public.my_hs_provider_id();
DROP FUNCTION IF EXISTS public.hs_can_access(uuid, text);
DROP FUNCTION IF EXISTS public.hs_can_write(uuid, text);
DROP FUNCTION IF EXISTS public.hs_path_company(text);
DROP FUNCTION IF EXISTS public.hs_my_companies();

-- ── outbox: recreate the four H&S triggers without provider_id ──────
-- (the fifth, hs_provider_companies_platform_event, went with its table)

DROP TRIGGER IF EXISTS compliance_items_platform_event ON public.compliance_items;
CREATE TRIGGER compliance_items_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','domain','category','title','due_date','source');

DROP TRIGGER IF EXISTS hs_register_completions_platform_event ON public.hs_register_completions;
CREATE TRIGGER hs_register_completions_platform_event AFTER INSERT ON public.hs_register_completions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('outcome','item_id','completed_on');

DROP TRIGGER IF EXISTS hs_activities_platform_event ON public.hs_activities;
CREATE TRIGGER hs_activities_platform_event AFTER INSERT ON public.hs_activities
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('activity_type','title','occurred_on');

DROP TRIGGER IF EXISTS hs_files_platform_event ON public.hs_files;
CREATE TRIGGER hs_files_platform_event AFTER INSERT ON public.hs_files
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('entity_type','entity_id','file_name');

-- ── BD Intelligence / BD Roles removed (no longer sourced from IvyLens) ─
-- bd_ivylens_dismissed existed only to persist dismissal of IvyLens-
-- synthesized rows on the two removed pages; domain/company_location/
-- friction_intel/ivylens_roles (101) were populated only by those pages'
-- in-memory merge, never by any writer — dead the moment the pages go.
-- bd_companies/bd_scanned_roles themselves, and the internal
-- prospect_score/next_action/outreach_status pipeline, are UNCHANGED:
-- they are populated by the Enquiry "Convert to prospect" flow and the
-- Sunday bd-score cron, neither of which depended on the live IvyLens
-- feed being removed here.

DROP TABLE IF EXISTS public.bd_ivylens_dismissed;
ALTER TABLE public.bd_companies DROP COLUMN IF EXISTS domain;
ALTER TABLE public.bd_companies DROP COLUMN IF EXISTS company_location;
ALTER TABLE public.bd_companies DROP COLUMN IF EXISTS friction_intel;
ALTER TABLE public.bd_companies DROP COLUMN IF EXISTS ivylens_roles;

COMMENT ON FUNCTION public.hs_actor_kind() IS 'staff | client | system (105: the provider branch is gone, H&S is staff-delivered).';
