-- ═══════════════════════════════════════════════════════════
-- 102: Support & BD vocabulary CHECKs
-- ═══════════════════════════════════════════════════════════
-- Apply AFTER the PR 4 code deploys. Each list is pinned by a tuple in
-- lib/ui/statusMaps.ts (SERVICE_REQUEST_TYPES, SERVICE_REQUEST_PRIORITIES)
-- and lib/bd/prospectScore.ts (BD_NEXT_ACTIONS); supportSql.test.ts
-- fails if either side drifts.

ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_request_type_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_request_type_check
  CHECK (request_type IN ('policy_update', 'salary_benchmark', 'manager_support', 'strategic_review', 'hr_audit', 'support_query'));

ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_priority_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_priority_check
  CHECK (priority IS NULL OR priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE public.bd_companies DROP CONSTRAINT IF EXISTS bd_companies_next_action_check;
ALTER TABLE public.bd_companies ADD CONSTRAINT bd_companies_next_action_check
  CHECK (next_action IS NULL OR next_action IN ('call', 'email_sequence', 'watch', 'dismiss'));
