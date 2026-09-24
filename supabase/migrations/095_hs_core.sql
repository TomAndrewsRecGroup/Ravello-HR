-- ═══════════════════════════════════════════════════════════════════
-- 095: Health & Safety core — sites, register, completions, activities,
--      evidence files and the Safety Timeline (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on 094 (providers + hs_can_access / hs_can_write).
--
--   * The REGISTER is compliance_items, extended. `domain` is derived
--     from the category ('hs' for hs_* and the legacy health_safety,
--     'hr' otherwise) so providers only ever see H&S rows. Each item can
--     recur (every N days/weeks/months/years) and carries its legal basis.
--   * A COMPLETION is insert-only evidence that an item was done on a
--     date. A trigger computes the next due date from the item's
--     recurrence and rolls the item forward — only when the completion is
--     the newest, so back-filling an old certificate never moves the
--     register backwards.
--   * ACTIVITIES are logged events: site visits, advice calls, fire
--     drills, SSIP submissions, inspections.
--   * FILES are evidence in the private hs-evidence bucket at
--     <company_id>/<entity_type>/<entity_id>/<uuid>-<name>.
--   * hs_events is the Safety Timeline clients review. It is APPEND-ONLY
--     and written ONLY by SECURITY DEFINER triggers: no insert, update or
--     delete privilege for anon/authenticated, so nobody can forge or
--     erase an entry. (Not activity_log: clients can insert there.)
--
-- Submitted records are immutable: completions, activities and files
-- have no UPDATE/DELETE path for anyone but staff. A correction is a new
-- row.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── helpers ─────────────────────────────────────────────────────────

-- Which provider scope an entity type belongs to.
CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_entity
           WHEN 'register_item'       THEN 'register'
           WHEN 'register_completion' THEN 'register'
           WHEN 'activity'            THEN 'register'
           WHEN 'site'                THEN 'register'
           WHEN 'document'            THEN 'documents'
           WHEN 'training'            THEN 'training'
           WHEN 'audit'               THEN 'audits'
           WHEN 'incident'            THEN 'incidents'
           ELSE NULL
         END;
$$;

-- Who the current caller is, for the record: 'staff' | 'provider' | 'client' | 'system'
-- (hs_actor_kind() from 094) plus their provider, if any.

-- ── sites ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  address     text CHECK (length(address) <= 500),
  postcode    text CHECK (length(postcode) <= 12),
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_sites_company_idx ON public.hs_sites (company_id);

-- ── the register: compliance_items, extended ───────────────────────

ALTER TABLE public.compliance_items
  ADD COLUMN IF NOT EXISTS domain text GENERATED ALWAYS AS (
    CASE WHEN category LIKE 'hs\_%' OR category = 'health_safety' THEN 'hs' ELSE 'hr' END
  ) STORED,
  ADD COLUMN IF NOT EXISTS site_id           uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_id       uuid REFERENCES public.hs_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_every  integer CHECK (recurrence_every IS NULL OR recurrence_every BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS recurrence_unit   text CHECK (recurrence_unit IS NULL OR recurrence_unit IN ('day', 'week', 'month', 'year')),
  ADD COLUMN IF NOT EXISTS last_completed_on date,
  ADD COLUMN IF NOT EXISTS legal_basis       text CHECK (length(legal_basis) <= 300),
  ADD COLUMN IF NOT EXISTS item_key          text CHECK (length(item_key) <= 80),
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'provider', 'pack', 'client')),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.compliance_items DROP CONSTRAINT IF EXISTS compliance_items_recurrence_pair;
ALTER TABLE public.compliance_items ADD CONSTRAINT compliance_items_recurrence_pair
  CHECK ((recurrence_every IS NULL) = (recurrence_unit IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS compliance_items_item_key_uniq
  ON public.compliance_items (company_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), item_key)
  WHERE item_key IS NOT NULL;

-- A register item a provider creates is stamped as theirs; the caller
-- cannot claim another provider or a different source.
CREATE OR REPLACE FUNCTION public.hs_register_item_stamp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.hs_actor_kind() = 'provider' THEN
      NEW.provider_id := public.my_hs_provider_id();
      NEW.source      := 'provider';
    END IF;
  ELSIF public.hs_actor_kind() <> 'staff' AND auth.uid() IS NOT NULL THEN
    -- Who created an item is history, not something a later editor sets.
    NEW.provider_id := OLD.provider_id;
    NEW.source      := OLD.source;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS compliance_items_hs_stamp ON public.compliance_items;
CREATE TRIGGER compliance_items_hs_stamp
  BEFORE INSERT OR UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.hs_register_item_stamp();

-- The next due date after a completion. Mirrored by lib/hs/recurrence.ts
-- (recurrence.test.ts pins both against the same cases). Month steps
-- clamp to the month's end: 31 Jan + 1 month = 28/29 Feb.
CREATE OR REPLACE FUNCTION public.hs_next_due(p_from date, p_every integer, p_unit text)
RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_every IS NULL OR p_unit IS NULL THEN NULL
           WHEN p_unit = 'day'   THEN p_from + p_every
           WHEN p_unit = 'week'  THEN p_from + p_every * 7
           WHEN p_unit = 'month' THEN (p_from + make_interval(months => p_every))::date
           WHEN p_unit = 'year'  THEN (p_from + make_interval(years  => p_every))::date
         END;
$$;

-- ── completions: insert-only evidence that an item was done ─────────

CREATE TABLE IF NOT EXISTS public.hs_register_completions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES public.compliance_items(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  completed_on    date NOT NULL CHECK (completed_on <= current_date + 1),
  outcome         text NOT NULL DEFAULT 'pass' CHECK (outcome IN ('pass', 'pass_with_actions', 'fail')),
  notes           text CHECK (length(notes) <= 4000),
  next_due_on     date,
  provider_id     uuid REFERENCES public.hs_providers(id) ON DELETE SET NULL,
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_register_completions_item_idx ON public.hs_register_completions (item_id, completed_on DESC);

-- BEFORE INSERT: the row's company, next due date and author come from
-- the database, never from the caller.
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
  NEW.provider_id      := public.my_hs_provider_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hs_completion_fill ON public.hs_register_completions;
CREATE TRIGGER hs_completion_fill
  BEFORE INSERT ON public.hs_register_completions
  FOR EACH ROW EXECUTE FUNCTION public.hs_completion_fill();

-- AFTER INSERT: roll the item forward, only if this is the newest completion.
CREATE OR REPLACE FUNCTION public.hs_completion_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS hs_completion_roll ON public.hs_register_completions;
CREATE TRIGGER hs_completion_roll
  AFTER INSERT ON public.hs_register_completions
  FOR EACH ROW EXECUTE FUNCTION public.hs_completion_roll();

-- ── activities: site visits, advice calls, drills, submissions ──────

CREATE TABLE IF NOT EXISTS public.hs_activities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id          uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  activity_type    text NOT NULL CHECK (activity_type IN (
                     'site_visit', 'advice_call', 'fire_drill', 'ssip_submission',
                     'inspection', 'meeting', 'other')),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  occurred_on      date NOT NULL CHECK (occurred_on <= current_date + 1),
  summary          text CHECK (length(summary) <= 8000),
  provider_id      uuid REFERENCES public.hs_providers(id) ON DELETE SET NULL,
  recorded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_activities_company_idx ON public.hs_activities (company_id, occurred_on DESC);

CREATE OR REPLACE FUNCTION public.hs_stamp_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.recorded_by      := auth.uid();
  NEW.recorded_by_kind := public.hs_actor_kind();
  NEW.provider_id      := public.my_hs_provider_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hs_activities_author ON public.hs_activities;
CREATE TRIGGER hs_activities_author
  BEFORE INSERT ON public.hs_activities
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

-- ── evidence files ──────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hs-evidence', 'hs-evidence', false, 26214400, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.hs_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type  text NOT NULL CHECK (public.hs_scope_for_entity(entity_type) IS NOT NULL),
  entity_id    uuid NOT NULL,
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 600),
  file_name    text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  mime_type    text CHECK (length(mime_type) <= 120),
  size_bytes   bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  provider_id  uuid REFERENCES public.hs_providers(id) ON DELETE SET NULL,
  recorded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- The key must sit under this company's folder and this entity.
  CONSTRAINT hs_files_path_matches CHECK (
    split_part(storage_path, '/', 1) = company_id::text
    AND split_part(storage_path, '/', 2) = entity_type
    AND split_part(storage_path, '/', 3) = entity_id::text
  )
);
CREATE INDEX IF NOT EXISTS hs_files_entity_idx ON public.hs_files (entity_type, entity_id);

DROP TRIGGER IF EXISTS hs_files_author ON public.hs_files;
CREATE TRIGGER hs_files_author
  BEFORE INSERT ON public.hs_files
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

-- ── the Safety Timeline ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL,
  entity_id   uuid,
  event_type  text NOT NULL,
  summary     text NOT NULL,
  actor_id    uuid,
  actor_kind  text NOT NULL,
  provider_id uuid
);
CREATE INDEX IF NOT EXISTS hs_events_company_idx ON public.hs_events (company_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.hs_log(
  p_company uuid, p_entity_type text, p_entity_id uuid, p_event text, p_summary text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The company is being deleted (a cascade): nothing to record against.
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN RETURN; END IF;
  INSERT INTO public.hs_events (company_id, entity_type, entity_id, event_type, summary, actor_id, actor_kind, provider_id)
  VALUES (p_company, p_entity_type, p_entity_id, p_event, left(p_summary, 500),
          auth.uid(), public.hs_actor_kind(), public.my_hs_provider_id());
END;
$$;
REVOKE ALL ON FUNCTION public.hs_log(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- One trigger function per source table, each AFTER and SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.hs_event_register_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.domain = 'hs' THEN
    PERFORM public.hs_log(NEW.company_id, 'register_item', NEW.id, 'added', 'Register item added: ' || NEW.title);
  ELSIF TG_OP = 'UPDATE' AND NEW.domain = 'hs' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'register_item', NEW.id, 'status_' || NEW.status::text,
      NEW.title || ': ' || replace(NEW.status::text, '_', ' '));
  ELSIF TG_OP = 'DELETE' AND OLD.domain = 'hs' THEN
    PERFORM public.hs_log(OLD.company_id, 'register_item', OLD.id, 'removed', 'Register item removed: ' || OLD.title);
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS compliance_items_hs_event ON public.compliance_items;
CREATE TRIGGER compliance_items_hs_event
  AFTER INSERT OR UPDATE OR DELETE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_register_item();

CREATE OR REPLACE FUNCTION public.hs_event_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t text;
BEGIN
  SELECT title INTO t FROM public.compliance_items WHERE id = NEW.item_id;
  PERFORM public.hs_log(NEW.company_id, 'register_completion', NEW.id, 'completed',
    coalesce(t, 'Register item') || ' completed on ' || to_char(NEW.completed_on, 'DD Mon YYYY')
    || CASE NEW.outcome WHEN 'pass' THEN '' WHEN 'fail' THEN ' (failed)' ELSE ' (actions raised)' END);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_register_completions_hs_event ON public.hs_register_completions;
CREATE TRIGGER hs_register_completions_hs_event
  AFTER INSERT ON public.hs_register_completions
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_completion();

CREATE OR REPLACE FUNCTION public.hs_event_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'activity', NEW.id, NEW.activity_type,
    initcap(replace(NEW.activity_type, '_', ' ')) || ': ' || NEW.title);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_activities_hs_event ON public.hs_activities;
CREATE TRIGGER hs_activities_hs_event
  AFTER INSERT ON public.hs_activities
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_activity();

CREATE OR REPLACE FUNCTION public.hs_event_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, NEW.entity_type, NEW.entity_id, 'file_added', 'Evidence added: ' || NEW.file_name);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_files_hs_event ON public.hs_files;
CREATE TRIGGER hs_files_hs_event
  AFTER INSERT ON public.hs_files
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_file();

CREATE OR REPLACE FUNCTION public.hs_event_site()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'site', NEW.id, 'added', 'Site added: ' || NEW.name);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_sites_hs_event ON public.hs_sites;
CREATE TRIGGER hs_sites_hs_event
  AFTER INSERT ON public.hs_sites
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_site();

-- Who can see and record this client's data is itself an event a client
-- should be able to see.
CREATE OR REPLACE FUNCTION public.hs_event_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pname text;
BEGIN
  SELECT name INTO pname FROM public.hs_providers WHERE id = coalesce(NEW.provider_id, OLD.provider_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'provider_access', NEW.id, 'granted',
      coalesce(pname, 'A provider') || ' given access: ' || array_to_string(NEW.scopes, ', '));
  ELSIF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.scopes IS DISTINCT FROM OLD.scopes
                              OR NEW.access_level IS DISTINCT FROM OLD.access_level) THEN
    PERFORM public.hs_log(NEW.company_id, 'provider_access', NEW.id, 'changed',
      coalesce(pname, 'A provider') || ' access now ' || NEW.status || ' (' || NEW.access_level || '): '
      || array_to_string(NEW.scopes, ', '));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.hs_log(OLD.company_id, 'provider_access', OLD.id, 'revoked',
      coalesce(pname, 'A provider') || ' access removed');
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_provider_companies_hs_event ON public.hs_provider_companies;
CREATE TRIGGER hs_provider_companies_hs_event
  AFTER INSERT OR UPDATE OR DELETE ON public.hs_provider_companies
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_assignment();

-- ── privileges: the timeline and completed records cannot be rewritten ─

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hs_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_register_completions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_activities           FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_files                FROM PUBLIC, anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.hs_sites                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_register_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_files                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_events               ENABLE ROW LEVEL SECURITY;

-- hs_sites
DROP POLICY IF EXISTS hs_sites_staff_all       ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_client_read     ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_provider_read   ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_provider_insert ON public.hs_sites;
DROP POLICY IF EXISTS hs_sites_provider_update ON public.hs_sites;
CREATE POLICY hs_sites_staff_all ON public.hs_sites FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_sites_client_read ON public.hs_sites FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
CREATE POLICY hs_sites_provider_read ON public.hs_sites FOR SELECT TO authenticated
  USING (public.hs_can_access(company_id, 'register'));
CREATE POLICY hs_sites_provider_insert ON public.hs_sites FOR INSERT TO authenticated
  WITH CHECK (public.hs_can_write(company_id, 'register'));
CREATE POLICY hs_sites_provider_update ON public.hs_sites FOR UPDATE TO authenticated
  USING (public.hs_can_write(company_id, 'register')) WITH CHECK (public.hs_can_write(company_id, 'register'));

-- compliance_items: providers see and write H&S rows only; clients may
-- delete only HR rows (the H&S register is recorded, not curated).
DROP POLICY IF EXISTS compliance_items_provider_read   ON public.compliance_items;
DROP POLICY IF EXISTS compliance_items_provider_insert ON public.compliance_items;
DROP POLICY IF EXISTS compliance_items_provider_update ON public.compliance_items;
CREATE POLICY compliance_items_provider_read ON public.compliance_items FOR SELECT TO authenticated
  USING (domain = 'hs' AND public.hs_can_access(company_id, 'register'));
CREATE POLICY compliance_items_provider_insert ON public.compliance_items FOR INSERT TO authenticated
  WITH CHECK (domain = 'hs' AND public.hs_can_write(company_id, 'register'));
CREATE POLICY compliance_items_provider_update ON public.compliance_items FOR UPDATE TO authenticated
  USING (domain = 'hs' AND public.hs_can_write(company_id, 'register'))
  WITH CHECK (domain = 'hs' AND public.hs_can_write(company_id, 'register'));
DROP POLICY IF EXISTS client_compliance_delete ON public.compliance_items;
CREATE POLICY client_compliance_delete ON public.compliance_items FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()) AND domain = 'hr');

-- hs_register_completions
DROP POLICY IF EXISTS hs_completions_staff_all       ON public.hs_register_completions;
DROP POLICY IF EXISTS hs_completions_client_read     ON public.hs_register_completions;
DROP POLICY IF EXISTS hs_completions_provider_read   ON public.hs_register_completions;
DROP POLICY IF EXISTS hs_completions_provider_insert ON public.hs_register_completions;
CREATE POLICY hs_completions_staff_all ON public.hs_register_completions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_completions_client_read ON public.hs_register_completions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
CREATE POLICY hs_completions_provider_read ON public.hs_register_completions FOR SELECT TO authenticated
  USING (public.hs_can_access(company_id, 'register'));
-- company_id is filled by the BEFORE trigger from the item, so the check
-- sees the item's real company, whatever the caller sent.
CREATE POLICY hs_completions_provider_insert ON public.hs_register_completions FOR INSERT TO authenticated
  WITH CHECK (public.hs_can_write(company_id, 'register'));

-- hs_activities
DROP POLICY IF EXISTS hs_activities_staff_all       ON public.hs_activities;
DROP POLICY IF EXISTS hs_activities_client_read     ON public.hs_activities;
DROP POLICY IF EXISTS hs_activities_provider_read   ON public.hs_activities;
DROP POLICY IF EXISTS hs_activities_provider_insert ON public.hs_activities;
CREATE POLICY hs_activities_staff_all ON public.hs_activities FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_activities_client_read ON public.hs_activities FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
CREATE POLICY hs_activities_provider_read ON public.hs_activities FOR SELECT TO authenticated
  USING (public.hs_can_access(company_id, 'register'));
CREATE POLICY hs_activities_provider_insert ON public.hs_activities FOR INSERT TO authenticated
  WITH CHECK (public.hs_can_write(company_id, 'register'));

-- hs_files
DROP POLICY IF EXISTS hs_files_staff_all       ON public.hs_files;
DROP POLICY IF EXISTS hs_files_client_read     ON public.hs_files;
DROP POLICY IF EXISTS hs_files_provider_read   ON public.hs_files;
DROP POLICY IF EXISTS hs_files_provider_insert ON public.hs_files;
CREATE POLICY hs_files_staff_all ON public.hs_files FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_files_client_read ON public.hs_files FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
CREATE POLICY hs_files_provider_read ON public.hs_files FOR SELECT TO authenticated
  USING (public.hs_can_access(company_id, public.hs_scope_for_entity(entity_type)));
CREATE POLICY hs_files_provider_insert ON public.hs_files FOR INSERT TO authenticated
  WITH CHECK (public.hs_can_write(company_id, public.hs_scope_for_entity(entity_type)));

-- hs_events: read-only for everybody; written by triggers alone.
DROP POLICY IF EXISTS hs_events_staff_read    ON public.hs_events;
DROP POLICY IF EXISTS hs_events_client_read   ON public.hs_events;
DROP POLICY IF EXISTS hs_events_provider_read ON public.hs_events;
CREATE POLICY hs_events_staff_read ON public.hs_events FOR SELECT TO authenticated
  USING ((SELECT public.is_tps_staff()));
CREATE POLICY hs_events_client_read ON public.hs_events FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
CREATE POLICY hs_events_provider_read ON public.hs_events FOR SELECT TO authenticated
  USING (public.hs_can_access(company_id, coalesce(public.hs_scope_for_entity(entity_type), 'register')));

-- ── storage: the hs-evidence bucket ─────────────────────────────────
-- Path: <company_id>/<entity_type>/<entity_id>/<uuid>-<name>.
-- Clients read their own company's folder. Providers read and upload by
-- the path's company and the scope of the path's entity type. Nobody but
-- staff updates or deletes: evidence is immutable.

DROP POLICY IF EXISTS hs_evidence_staff_all       ON storage.objects;
DROP POLICY IF EXISTS hs_evidence_client_read     ON storage.objects;
DROP POLICY IF EXISTS hs_evidence_provider_read   ON storage.objects;
DROP POLICY IF EXISTS hs_evidence_provider_insert ON storage.objects;
CREATE POLICY hs_evidence_staff_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'hs-evidence' AND (SELECT public.is_tps_staff()))
  WITH CHECK (bucket_id = 'hs-evidence' AND (SELECT public.is_tps_staff()));
CREATE POLICY hs_evidence_client_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hs-evidence'
         AND (storage.foldername(name))[1] = (SELECT public.my_company_id())::text);
CREATE POLICY hs_evidence_provider_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hs-evidence'
         AND public.hs_can_access(public.hs_path_company(name), public.hs_scope_for_entity((storage.foldername(name))[2])));
CREATE POLICY hs_evidence_provider_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hs-evidence'
              AND public.hs_can_write(public.hs_path_company(name), public.hs_scope_for_entity((storage.foldername(name))[2])));

-- hs_scope_for_entity / hs_next_due are pure; the rest are DEFINER and
-- must not be callable by anon.
REVOKE ALL ON FUNCTION public.hs_register_item_stamp()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_completion_fill()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_completion_roll()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_stamp_author()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_register_item()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_completion()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_activity()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_file()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_site()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hs_event_assignment()       FROM PUBLIC, anon, authenticated;
