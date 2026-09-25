-- ═══════════════════════════════════════════════════════════
-- 101: Support & BD flow columns
-- ═══════════════════════════════════════════════════════════
-- Additive; apply before the PR 4 code deploys. 102 adds the CHECKs
-- after the deploy.
--
-- service_requests is THE support object (tickets has never had a
-- writer). A request gets an SLA at insert (a BEFORE trigger, mirrored
-- by lib/support/sla.ts), an owner, a first-response stamp and a
-- triage JSONB the consumer fills from Jev — a recommendation the
-- Requests screen shows, never a status write.

ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS assigned_to        uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS priority           text;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS first_response_at  timestamptz;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS sla_due_at         timestamptz;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS triage             jsonb;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS source             text NOT NULL DEFAULT 'portal';
CREATE INDEX IF NOT EXISTS service_requests_sla_open_idx ON public.service_requests (sla_due_at) WHERE first_response_at IS NULL;

-- The SLA clock: urgent 4h, high 24h, everything else 72h, from the
-- request's own created_at. Urgency is matched case-insensitively
-- because the portal form writes 'Urgent' and the admin writes 'urgent'.
CREATE OR REPLACE FUNCTION public.service_request_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := NEW.created_at + CASE lower(coalesce(NEW.urgency, ''))
      WHEN 'urgent' THEN interval '4 hours'
      WHEN 'high'   THEN interval '24 hours'
      ELSE               interval '72 hours'
    END;
  END IF;
  IF NEW.priority IS NULL THEN
    NEW.priority := CASE lower(coalesce(NEW.urgency, ''))
      WHEN 'urgent' THEN 'urgent'
      WHEN 'high'   THEN 'high'
      WHEN 'low'    THEN 'low'
      ELSE               'normal'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_requests_sla ON public.service_requests;
CREATE TRIGGER service_requests_sla BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_sla();

-- Existing open rows get a clock too (none in production at the time).
UPDATE public.service_requests SET sla_due_at = created_at + CASE lower(coalesce(urgency, ''))
  WHEN 'urgent' THEN interval '4 hours' WHEN 'high' THEN interval '24 hours' ELSE interval '72 hours' END
WHERE sla_due_at IS NULL;
UPDATE public.service_requests SET first_response_at = responded_at WHERE first_response_at IS NULL AND responded_at IS NOT NULL;

-- Enquiries link to the prospect they were converted into, and carry
-- Jev's intent/fit read for the list's chips and sort.
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS bd_company_id uuid REFERENCES public.bd_companies(id) ON DELETE SET NULL;
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS triage        jsonb;

-- bd_companies: the four columns the BD Intelligence page has selected
-- since the IvyLens merge (domain, company_location, friction_intel,
-- ivylens_roles) never existed in production, so that query failed and
-- no local prospect ever rendered. Plus the weekly score.
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS domain           text;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS company_location text;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS friction_intel   jsonb;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS ivylens_roles    jsonb;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS prospect_score   integer;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS next_action      text;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS scored_at        timestamptz;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS score_inputs     jsonb;
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS source           text NOT NULL DEFAULT 'scan';
ALTER TABLE public.bd_companies ADD COLUMN IF NOT EXISTS outreach_status  text;

-- Outbox whitelists gain the new flow columns. Never `details`,
-- `notes`, `triage` or `result` — those carry client and public text.
DROP TRIGGER IF EXISTS service_requests_platform_event ON public.service_requests;
CREATE TRIGGER service_requests_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','request_type','urgency','subject','submitted_by','responded_at','assigned_to','priority','first_response_at','sla_due_at');

DROP TRIGGER IF EXISTS enquiries_platform_event ON public.enquiries;
CREATE TRIGGER enquiries_platform_event AFTER INSERT OR UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','source','company_name','bd_company_id');

DROP TRIGGER IF EXISTS bd_companies_platform_event ON public.bd_companies;
CREATE TRIGGER bd_companies_platform_event AFTER INSERT OR UPDATE ON public.bd_companies
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','prospect_score','next_action','outreach_status');
