-- ═══════════════════════════════════════════════════════════
-- 097: vocabulary CHECKs for actions, service_requests, platform_events
-- ═══════════════════════════════════════════════════════════
-- Apply AFTER the PR1 code deploys. The previously deployed admin
-- client tab still wrote priority 'medium' and a form could still write
-- a service-request status the portal never reads; a CHECK applied
-- before the deploy would refuse those writes. Each CHECK is pinned by
-- a test against the tuple in lib/ui/statusMaps.ts.

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_priority_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_status_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_status_check
  CHECK (status IN ('active', 'dismissed', 'complete'));

ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('new', 'in_progress', 'complete'));

ALTER TABLE public.platform_events DROP CONSTRAINT IF EXISTS platform_events_actor_kind_check;
ALTER TABLE public.platform_events ADD CONSTRAINT platform_events_actor_kind_check
  CHECK (actor_kind IN ('system', 'staff', 'provider', 'client'));

ALTER TABLE public.platform_events DROP CONSTRAINT IF EXISTS platform_events_event_type_check;
ALTER TABLE public.platform_events ADD CONSTRAINT platform_events_event_type_check
  CHECK (event_type IN ('created', 'updated', 'deleted', 'reminder'));
