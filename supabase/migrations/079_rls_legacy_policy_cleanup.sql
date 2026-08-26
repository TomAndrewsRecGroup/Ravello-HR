-- ═══════════════════════════════════════════════════════════
-- Phase 79: Drop 90 superseded RLS policies, replace 2 unsafe ones
--
-- WHY THIS MATTERS MORE THAN IT LOOKS
--
-- Postgres combines PERMISSIVE policies with OR. A row is allowed if
-- ANY policy permits it, so the most permissive policy decides and
-- every stricter one beside it is decoration.
--
-- Migrations 010, 028 and 030 rewrote the policy set with descriptive
-- names but never dropped the short-named originals. The result: 251
-- policies across 67 tables, 99 of them legacy, six tables carrying
-- FOUR permissive policies for the same command.
--
-- Two legacy policies checked only that somebody was logged in:
--
--   activity_log  al_ins   auth.uid() IS NOT NULL
--   notifications nt_ins   auth.uid() IS NOT NULL
--
-- Beside them sat correct policies scoping to the caller's company.
-- The OR meant the correct ones never applied. Any authenticated user
-- — including a client — could insert an activity_log row against
-- another company, or push a notification to another company's users.
-- The second is an in-product phishing surface, not just an integrity
-- problem.
--
-- The broader risk is worse than either: while a legacy twin exists,
-- ANY future tightening of a policy is silently cancelled.
--
-- VERIFIED BEFORE WRITING (live, project sbmekaviwkiyorvmtgcu):
--   * 99 legacy policies; 90 have a non-legacy replacement on the same
--     table and command.
--   * Dropping those 90 leaves ZERO (table, command) pairs without
--     coverage — checked by set difference, not by eye.
--   * The remaining 9 are the ONLY policy for their table+command and
--     are NOT dropped here. Seven are correctly scoped and stay as they
--     are; the two that are not are replaced below.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. The 90 superseded duplicates ───────────────────────

DROP POLICY IF EXISTS ab_ad ON public.absence_records;
DROP POLICY IF EXISTS ab_cl ON public.absence_records;
DROP POLICY IF EXISTS ac_all ON public.actions;
DROP POLICY IF EXISTS ac_sel ON public.actions;
DROP POLICY IF EXISTS ac_upd ON public.actions;
DROP POLICY IF EXISTS al_ins ON public.activity_log;
DROP POLICY IF EXISTS al_sel ON public.activity_log;
DROP POLICY IF EXISTS ca_all ON public.candidates;
DROP POLICY IF EXISTS ca_sel ON public.candidates;
DROP POLICY IF EXISTS ca_upd ON public.candidates;
DROP POLICY IF EXISTS cn_all ON public.client_notes;
DROP POLICY IF EXISTS cs_all ON public.client_services;
DROP POLICY IF EXISTS cs_sel ON public.client_services;
DROP POLICY IF EXISTS co_all ON public.companies;
DROP POLICY IF EXISTS co_sel ON public.companies;
DROP POLICY IF EXISTS ce_del ON public.company_calendar_events;
DROP POLICY IF EXISTS ce_ins ON public.company_calendar_events;
DROP POLICY IF EXISTS ce_sel ON public.company_calendar_events;
DROP POLICY IF EXISTS ce_upd ON public.company_calendar_events;
DROP POLICY IF EXISTS ci_all ON public.compliance_items;
DROP POLICY IF EXISTS ci_sel ON public.compliance_items;
DROP POLICY IF EXISTS da_ins ON public.data_access_requests;
DROP POLICY IF EXISTS da_sel ON public.data_access_requests;
DROP POLICY IF EXISTS da_upd ON public.data_access_requests;
DROP POLICY IF EXISTS dc_all ON public.documents;
DROP POLICY IF EXISTS dc_sel ON public.documents;
DROP POLICY IF EXISTS ed_ad ON public.employee_documents;
DROP POLICY IF EXISTS ed_cl ON public.employee_documents;
DROP POLICY IF EXISTS er_del ON public.employee_records;
DROP POLICY IF EXISTS er_ins ON public.employee_records;
DROP POLICY IF EXISTS er_sel ON public.employee_records;
DROP POLICY IF EXISTS er_upd ON public.employee_records;
DROP POLICY IF EXISTS hm_ad ON public.hr_metrics;
DROP POLICY IF EXISTS hm_cl ON public.hr_metrics;
DROP POLICY IF EXISTS it_all ON public.internal_tasks;
DROP POLICY IF EXISTS iv_all ON public.interview_schedules;
DROP POLICY IF EXISTS iv_sel ON public.interview_schedules;
DROP POLICY IF EXISTS il_ad ON public.ivylens_tickets;
DROP POLICY IF EXISTS il_cl ON public.ivylens_tickets;
DROP POLICY IF EXISTS lc_ad ON public.learning_content;
DROP POLICY IF EXISTS lc_pub ON public.learning_content;
DROP POLICY IF EXISTS lp_ad ON public.learning_purchases;
DROP POLICY IF EXISTS lp_ins ON public.learning_purchases;
DROP POLICY IF EXISTS lp_sel ON public.learning_purchases;
DROP POLICY IF EXISTS lr_ins ON public.leave_records;
DROP POLICY IF EXISTS lr_sel ON public.leave_records;
DROP POLICY IF EXISTS lr_upd ON public.leave_records;
DROP POLICY IF EXISTS ms_all ON public.milestones;
DROP POLICY IF EXISTS ms_sel ON public.milestones;
DROP POLICY IF EXISTS of_i_all ON public.offboarding_instances;
DROP POLICY IF EXISTS of_i_sel ON public.offboarding_instances;
DROP POLICY IF EXISTS of_p_all ON public.offboarding_task_progress;
DROP POLICY IF EXISTS of_p_sel ON public.offboarding_task_progress;
DROP POLICY IF EXISTS of_t_all ON public.offboarding_templates;
DROP POLICY IF EXISTS of_t_sel ON public.offboarding_templates;
DROP POLICY IF EXISTS of_all ON public.offers;
DROP POLICY IF EXISTS of_sel ON public.offers;
DROP POLICY IF EXISTS ob_i_all ON public.onboarding_instances;
DROP POLICY IF EXISTS ob_i_sel ON public.onboarding_instances;
DROP POLICY IF EXISTS ob_p_all ON public.onboarding_task_progress;
DROP POLICY IF EXISTS ob_p_sel ON public.onboarding_task_progress;
DROP POLICY IF EXISTS ob_t_all ON public.onboarding_templates;
DROP POLICY IF EXISTS ob_t_sel ON public.onboarding_templates;
DROP POLICY IF EXISTS rv_ad ON public.performance_reviews;
DROP POLICY IF EXISTS rv_cl ON public.performance_reviews;
DROP POLICY IF EXISTS pa_all ON public.policy_acknowledgements;
DROP POLICY IF EXISTS pa_sel ON public.policy_acknowledgements;
DROP POLICY IF EXISTS pr_all ON public.profiles;
DROP POLICY IF EXISTS pr_sel ON public.profiles;
DROP POLICY IF EXISTS pr_upd ON public.profiles;
DROP POLICY IF EXISTS rp_all ON public.reports;
DROP POLICY IF EXISTS rp_sel ON public.reports;
DROP POLICY IF EXISTS rq_all ON public.requisitions;
DROP POLICY IF EXISTS rq_ins ON public.requisitions;
DROP POLICY IF EXISTS rq_sel ON public.requisitions;
DROP POLICY IF EXISTS sb_all ON public.salary_benchmarks;
DROP POLICY IF EXISTS sb_sel ON public.salary_benchmarks;
DROP POLICY IF EXISTS sr_all ON public.service_requests;
DROP POLICY IF EXISTS sr_ins ON public.service_requests;
DROP POLICY IF EXISTS sr_sel ON public.service_requests;
DROP POLICY IF EXISTS sm_ad ON public.skills_matrix;
DROP POLICY IF EXISTS sm_cl ON public.skills_matrix;
DROP POLICY IF EXISTS tm_all ON public.ticket_messages;
DROP POLICY IF EXISTS tm_ins ON public.ticket_messages;
DROP POLICY IF EXISTS tm_sel ON public.ticket_messages;
DROP POLICY IF EXISTS tk_all ON public.tickets;
DROP POLICY IF EXISTS tk_ins ON public.tickets;
DROP POLICY IF EXISTS tk_sel ON public.tickets;
DROP POLICY IF EXISTS tn_ad ON public.training_needs;
DROP POLICY IF EXISTS tn_cl ON public.training_needs;

-- ─── 2. notifications INSERT: replace, do not drop ─────────
--
-- nt_ins is the ONLY insert policy on this table, so dropping it would
-- block notifications entirely. It is replaced with one that scopes to
-- the caller's own company. Staff may still notify anyone — that is how
-- the client-facing alerts work — but a client can no longer push a
-- notification into another company's users' feeds.

DROP POLICY IF EXISTS nt_ins ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_scoped ON public.notifications;

CREATE POLICY notifications_insert_scoped ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_tps_staff())
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notifications.user_id
        AND p.company_id = (SELECT public.my_company_id())
    )
  );

-- ─── 3. sync_state: staff only ─────────────────────────────
--
-- ss_all permitted ALL operations to any authenticated user. This table
-- holds integration cursors for the IvyLens ticket sync; a client
-- rewinding or corrupting a cursor would silently break the sync for
-- everyone. No client surface reads or writes it.

DROP POLICY IF EXISTS ss_all ON public.sync_state;
DROP POLICY IF EXISTS sync_state_staff_only ON public.sync_state;

CREATE POLICY sync_state_staff_only ON public.sync_state
  FOR ALL TO authenticated
  USING      ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));
