-- ═══════════════════════════════════════════════════════════════════
-- 213: contract/policy template library with native e-signing
-- ═══════════════════════════════════════════════════════════════════
-- Part 2 of the Peninsula-style gap-closure programme (see CLAUDE.md's
-- "Part 1" entry, 212, for the account-contact/profiles.phone half of
-- the same user decision). Explicit, recorded user decisions this
-- migration implements:
--   - Build the template library + e-signing. Do NOT build an AI
--     advice chatbot. Do NOT build tribunal representation/insurance.
--   - Signatures are NATIVE, built in-house — never a third-party
--     e-sign vendor (DocuSign/Dropbox Sign/etc.) integrated. A typed/
--     drawn name + a consent checkbox + an IP/timestamp/user-agent
--     audit trail is a "simple electronic signature" under the UK's
--     Electronic Communications Act 2000 s.7 — legally capable for
--     most commercial HR documents, but explicitly NOT a qualified/
--     advanced signature, and the UI must never claim otherwise.
--   - The library ships with a FEW CLEARLY-MARKED starter examples
--     (`is_example`, seeded in a later migration), not empty and not
--     a large vetted catalogue — each flagged "Example — must be
--     reviewed by a qualified advisor before real use."
--
-- Three tables:
--   document_templates        — staff-authored, global (no company_id).
--                                `body` carries {{merge_field}}
--                                placeholders; `merge_fields` names
--                                which ones a generator must fill.
--                                Versioned the hs_documents (106) way:
--                                a new version is a new row
--                                (supersedes_id), never an edit of a
--                                published one. Client-READ only
--                                (any client_admin may browse the
--                                catalogue to generate from it); never
--                                client-writable — HR/legal document
--                                wording is staff-curated content, the
--                                same posture jd_templates (011) and
--                                hs_sector_packs (106) already take
--                                for their own staff-authored catalogues.
--   document_instances         — one GENERATED document for one
--                                employee. `rendered_body` is FROZEN
--                                at generation time (never re-rendered
--                                if the template changes later — the
--                                document_versions/hs_documents
--                                "a correction is a new row, not a
--                                live re-render" discipline, applied
--                                here to the instance's own snapshot
--                                rather than to the instance itself).
--                                Client-writable: gated on
--                                is_company_super_user(), not a plain
--                                company session — generating/managing
--                                an employment contract or a
--                                settlement agreement is deliberately
--                                an admin-level act, the same
--                                sensitivity line employee_records'
--                                own sensitive-column guard (131)
--                                already draws for salary/NI/DOB.
--   document_signature_tokens  — the no-login signing link. Exact
--                                policy_ack_tokens (103) shape:
--                                SHA-256 hash only, RLS-on-NO-POLICIES
--                                (service role only), single-use
--                                (burned on sign — enforced in the
--                                application layer the same way
--                                policy_ack_tokens' own burn-on-sign
--                                is, since this table has no session
--                                policy to enforce it in SQL at all).
--
-- doc_category (001, widened 078) is reused for `category` on both
-- tables — one vocabulary, never a parallel copy.

-- ── 1. document_templates ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL CHECK (length(title) <= 200),
  category           doc_category NOT NULL DEFAULT 'contract',
  description        text CHECK (description IS NULL OR length(description) <= 1000),
  body               text NOT NULL CHECK (length(body) <= 50000),
  merge_fields       jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_signature boolean NOT NULL DEFAULT true,
  is_example         boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded','archived')),
  supersedes_id      uuid REFERENCES public.document_templates(id),
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_templates_status_idx ON public.document_templates(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS document_templates_supersedes_idx ON public.document_templates(supersedes_id);

COMMENT ON TABLE public.document_templates IS
  'Staff-authored HR/legal document templates (contracts, letters, settlement shells). Global, no company_id. Versioned via supersedes_id (213).';
COMMENT ON COLUMN public.document_templates.is_example IS
  'Seeded starter content, flagged in the UI: "Example — must be reviewed by a qualified advisor before real use." Never implies the content is vetted legal advice.';

-- Reuses the existing public.update_updated_at() (001), already used
-- by 10+ tables — never a redefinition.
DROP TRIGGER IF EXISTS document_templates_updated_at ON public.document_templates;
CREATE TRIGGER document_templates_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Supersede BOTH the named parent (id = NEW.supersedes_id) AND any
-- sibling that ALSO points at that same parent (supersedes_id =
-- NEW.supersedes_id) — the exact sibling-race lesson Phase 5 Group 10
-- (migrations 164-166) learned on hs_documents/emergency_plans/
-- environmental_aspects: two editors both naming the same parent must
-- not both end up "active". A first draft of this trigger matched
-- only the sibling half and never the parent itself (since the parent
-- row's own supersedes_id is NULL, not NEW.supersedes_id) — caught
-- live by this migration's own rolled-back probe before it shipped.
CREATE OR REPLACE FUNCTION public.document_templates_supersede_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.supersedes_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE public.document_templates
       SET status = 'superseded', updated_at = now()
     WHERE (id = NEW.supersedes_id OR supersedes_id = NEW.supersedes_id)
       AND id <> NEW.id
       AND status = 'active';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.document_templates_supersede_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_templates_supersede_roll ON public.document_templates;
CREATE TRIGGER document_templates_supersede_roll AFTER INSERT OR UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.document_templates_supersede_roll();

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_templates_staff_all ON public.document_templates;
CREATE POLICY document_templates_staff_all ON public.document_templates
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

-- A client_admin may browse the active catalogue to pick a template to
-- generate from (Group 4) — never a plain client_user: this is the
-- same "admin-level act" line employee_records' sensitive columns draw.
DROP POLICY IF EXISTS document_templates_client_read ON public.document_templates;
CREATE POLICY document_templates_client_read ON public.document_templates
  FOR SELECT TO authenticated
  USING (status = 'active' AND (SELECT public.is_company_super_user()));

-- No client write policy exists, so no apply_write_guard() call here —
-- the jd_templates (011) precedent: a staff-only-write reference table
-- needs no write guard.

DROP TRIGGER IF EXISTS document_templates_audit ON public.document_templates;
CREATE TRIGGER document_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('document_template', '-', 'title', 'category', 'status', 'requires_signature', 'is_example');

-- ── 2. document_instances ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_instances (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id          uuid NOT NULL REFERENCES public.document_templates(id),
  employee_id          uuid NOT NULL REFERENCES public.employee_records(id),
  category             doc_category NOT NULL,
  rendered_title       text NOT NULL CHECK (length(rendered_title) <= 200),
  rendered_body        text NOT NULL CHECK (length(rendered_body) <= 50000),
  merge_values         jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_signature   boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent_for_signature','signed','declined','voided')),
  storage_path         text,
  created_by           uuid REFERENCES auth.users(id),
  sent_for_signature_at timestamptz,
  signed_at            timestamptz,
  signed_by_name       text CHECK (signed_by_name IS NULL OR length(signed_by_name) <= 200),
  signed_ip            text CHECK (signed_ip IS NULL OR length(signed_ip) <= 64),
  signed_user_agent    text CHECK (signed_user_agent IS NULL OR length(signed_user_agent) <= 500),
  declined_at          timestamptz,
  declined_reason      text CHECK (declined_reason IS NULL OR length(declined_reason) <= 1000),
  voided_at            timestamptz,
  voided_by            uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_instances_company_idx ON public.document_instances(company_id);
CREATE INDEX IF NOT EXISTS document_instances_employee_idx ON public.document_instances(employee_id);
CREATE INDEX IF NOT EXISTS document_instances_status_idx ON public.document_instances(status);

COMMENT ON TABLE public.document_instances IS
  'One generated document for one employee, frozen at generation time (213). Client-writable, gated on is_company_super_user().';

DROP TRIGGER IF EXISTS document_instances_updated_at ON public.document_instances;
CREATE TRIGGER document_instances_updated_at BEFORE UPDATE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- The employee named must belong to the SAME organisation as the
-- instance itself — assert_same_org (118) raises 23514 on mismatch,
-- no-ops on a null id (never reachable here since employee_id is
-- NOT NULL, kept for consistency with every other caller of this
-- helper).
CREATE OR REPLACE FUNCTION public.document_instances_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'employee_records', NEW.employee_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.document_instances_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_instances_guard ON public.document_instances;
CREATE TRIGGER document_instances_guard BEFORE INSERT OR UPDATE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.document_instances_guard();

ALTER TABLE public.document_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_instances_staff_all ON public.document_instances;
CREATE POLICY document_instances_staff_all ON public.document_instances
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS document_instances_client_select ON public.document_instances;
CREATE POLICY document_instances_client_select ON public.document_instances
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()));

DROP POLICY IF EXISTS document_instances_client_insert ON public.document_instances;
CREATE POLICY document_instances_client_insert ON public.document_instances
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()));

DROP POLICY IF EXISTS document_instances_client_update ON public.document_instances;
CREATE POLICY document_instances_client_update ON public.document_instances
  FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()));

-- No client DELETE policy — voiding a document is a status change
-- (status = 'voided'), never a row deletion, the standing
-- "a correction is a new row / a status, never a delete" discipline.

SELECT public.apply_write_guard('public.document_instances');

DROP TRIGGER IF EXISTS document_instances_audit ON public.document_instances;
CREATE TRIGGER document_instances_audit AFTER INSERT OR UPDATE OR DELETE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('document_instance', 'company_id', 'status', 'category', 'template_id', 'employee_id');

-- Outbox: status/category/template_id/employee_id only — never
-- rendered_body, merge_values, signed_by_name or declined_reason.
--
-- CORRECTED (Part 2, Group 7, found while auditing whether this
-- promise had been kept): no async consequence rule was ever wired
-- for this table, and none is needed. Group 5's send/sign routes
-- (and Group 6's resend/void) each notify the right person
-- SYNCHRONOUSLY, from inside the controlled route itself — the
-- employee on send, the sender on sign/decline — the exact "a
-- controlled entry point notifies directly, no async consumer
-- needed" shape the H&S Tests public-token route already
-- established. Routing this through the five-minute outbox consumer
-- instead would only delay a notification that already exists. This
-- table stays in TRIGGERED_ENTITIES anyway, for What Changed?/audit
-- visibility — it simply has no rule subscribed to it, by design,
-- not by omission.
DROP TRIGGER IF EXISTS document_instances_platform_event ON public.document_instances;
CREATE TRIGGER document_instances_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','category','template_id','employee_id');

-- ── 3. document_signature_tokens ────────────────────────────────────
-- Exact policy_ack_tokens (103) shape: RLS on, no policies at all —
-- service role only. Single-use is enforced by the application layer
-- deleting the row on a successful sign, the same reason
-- policy_ack_tokens' own "burn on acknowledge" has no SQL-level
-- enforcement either (there is no session policy to enforce it in).

CREATE TABLE IF NOT EXISTS public.document_signature_tokens (
  token_hash            text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  document_instance_id  uuid NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS document_signature_tokens_instance_idx ON public.document_signature_tokens (document_instance_id);

ALTER TABLE public.document_signature_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = service role only.
REVOKE ALL ON public.document_signature_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.document_signature_tokens IS
  'SHA-256 of document-signing links. Service role only: RLS on, no policies (213), the policy_ack_tokens (103) shape.';
