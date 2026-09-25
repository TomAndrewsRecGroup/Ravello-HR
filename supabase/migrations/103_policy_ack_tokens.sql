-- ═══════════════════════════════════════════════════════════
-- 103: policy acknowledgement links for employees with no login
-- ═══════════════════════════════════════════════════════════
-- Additive; apply before the PR 3b code deploys.
--
-- "Request sign-off" wrote a policy_acknowledgements row and sent
-- nothing: the employee has no portal login by design, so nothing could
-- reach them. Now the consumer emails a personal link
-- (/policy/<token>) whose SHA-256 lives here, the same shape as
-- profile_access_tokens (091): RLS on, no policies, service role only.
-- A link stays valid until it is used (the employee may open the
-- document, read it, and come back) or 30 days pass; acknowledging burns
-- every link for that row.

CREATE TABLE IF NOT EXISTS public.policy_ack_tokens (
  token_hash         text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  acknowledgement_id uuid NOT NULL REFERENCES public.policy_acknowledgements(id) ON DELETE CASCADE,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_ack_tokens_ack_idx ON public.policy_ack_tokens (acknowledgement_id);

ALTER TABLE public.policy_ack_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = service role only.
REVOKE ALL ON public.policy_ack_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.policy_ack_tokens IS
  'SHA-256 of employee policy-acknowledgement links. Service role only: RLS on, no policies (103).';

-- When the link was last emailed, and how the row was signed.
ALTER TABLE public.policy_acknowledgements ADD COLUMN IF NOT EXISTS link_sent_at     timestamptz;
ALTER TABLE public.policy_acknowledgements ADD COLUMN IF NOT EXISTS acknowledged_via text;
ALTER TABLE public.policy_acknowledgements DROP CONSTRAINT IF EXISTS policy_acknowledgements_acknowledged_via_check;
ALTER TABLE public.policy_acknowledgements ADD CONSTRAINT policy_acknowledgements_acknowledged_via_check
  CHECK (acknowledged_via IS NULL OR acknowledged_via IN ('link', 'admin'));
