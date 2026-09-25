-- ═══════════════════════════════════════════════════════════
-- 100: policy acknowledgement status CHECK
-- ═══════════════════════════════════════════════════════════
-- Apply AFTER the PR 3 code deploys. 'cancelled' is what the consumer
-- writes when an employee leaves with acknowledgements still pending.

ALTER TABLE public.policy_acknowledgements DROP CONSTRAINT IF EXISTS policy_acknowledgements_status_check;
ALTER TABLE public.policy_acknowledgements ADD CONSTRAINT policy_acknowledgements_status_check
  CHECK (status IN ('pending', 'acknowledged', 'overdue', 'cancelled'));
