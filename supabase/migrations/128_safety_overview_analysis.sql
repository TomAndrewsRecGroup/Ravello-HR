-- ═══════════════════════════════════════════════════════════════════
-- 128: the Safety Overview and Analysis figures (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Spec §3 (Overview) and §77 (Management information): FACTUAL counts
-- only — nothing predicted, scored or projected (spec §85).
--
-- Two functions, SECURITY INVOKER: every count passes the caller's own
-- RLS, so an employee who can see only their own reports gets figures
-- about their own reports, a consultant gets the client they are
-- ACTING in (my_company_id()), and nothing is ever aggregated across
-- organisations. They exist to make each page ONE round trip instead of
-- a dozen, and so that "high residual risk" is banded by each
-- assessment's own matrix (hs_risk_level) — the page would otherwise
-- have to fetch every risk item to band it.
--
-- Residual risk is COALESCE(residual, initial): an item nobody has
-- re-scored after controls is still carrying its initial risk.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hs_safety_overview(p_site uuid DEFAULT NULL, p_department uuid DEFAULT NULL,
                                                      p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH org AS (SELECT public.my_company_id() AS id),
  lim AS (SELECT COALESCE(p_from, date_trunc('month', current_date)::date) AS f,
                 COALESCE(p_to, current_date) AS t),
  live_ra AS (
    SELECT ra.id, ra.status, ra.review_date, m.bands FROM risk_assessments ra
      JOIN risk_matrices m ON m.id = ra.risk_matrix_id, org
     WHERE ra.company_id = org.id AND ra.status IN ('approved','active','review_due')
       AND (p_site IS NULL OR ra.site_id = p_site) AND (p_department IS NULL OR ra.department_id = p_department))
  SELECT jsonb_build_object(
    'period_from', (SELECT f FROM lim), 'period_to', (SELECT t FROM lim),
    'open_hazards', (SELECT count(*) FROM hazards h, org WHERE h.company_id = org.id AND h.status NOT IN ('closed','archived')
                       AND (p_site IS NULL OR h.site_id = p_site) AND (p_department IS NULL OR h.department_id = p_department)),
    'unassessed_hazards', (SELECT count(*) FROM hazards h, org WHERE h.company_id = org.id AND h.status = 'identified'
                       AND (p_site IS NULL OR h.site_id = p_site) AND (p_department IS NULL OR h.department_id = p_department)),
    'high_residual_risks', (SELECT count(*) FROM risk_assessment_items i JOIN live_ra r ON r.id = i.risk_assessment_id
                       WHERE i.status <> 'not_required'
                         AND public.hs_risk_level(r.bands, COALESCE(i.residual_risk_score, i.initial_risk_score)) IN ('high','very_high')),
    'ra_review_required', (SELECT count(*) FROM live_ra r WHERE r.status = 'review_due' OR r.review_date < current_date),
    'active_rams', (SELECT count(*) FROM method_statements m, org WHERE m.company_id = org.id AND m.status IN ('approved','active')
                       AND (m.end_date IS NULL OR m.end_date >= current_date)
                       AND (p_site IS NULL OR m.site_id = p_site) AND (p_department IS NULL OR m.department_id = p_department)),
    'coshh_review_required', (SELECT count(*) FROM coshh_assessments c, org WHERE c.company_id = org.id
                       AND (c.status = 'review_due' OR (c.status IN ('approved','active') AND c.review_date < current_date))
                       AND (p_site IS NULL OR c.site_id = p_site) AND (p_department IS NULL OR c.department_id = p_department)),
    'incidents_in_period', (SELECT count(*) FROM hs_incidents i, org, lim WHERE i.company_id = org.id AND i.incident_type <> 'near_miss'
                       AND i.occurred_on BETWEEN lim.f AND lim.t
                       AND (p_site IS NULL OR i.site_id = p_site) AND (p_department IS NULL OR i.department_id = p_department)),
    'near_misses_in_period', (SELECT count(*) FROM hs_incidents i, org, lim WHERE i.company_id = org.id AND i.incident_type = 'near_miss'
                       AND i.occurred_on BETWEEN lim.f AND lim.t
                       AND (p_site IS NULL OR i.site_id = p_site) AND (p_department IS NULL OR i.department_id = p_department)),
    'investigations_open', (SELECT count(*) FROM incident_investigations v JOIN hs_incidents i ON i.id = v.incident_id, org
                       WHERE v.company_id = org.id AND v.status IN ('in_progress','pending_approval','changes_requested')
                         AND (p_site IS NULL OR i.site_id = p_site) AND (p_department IS NULL OR i.department_id = p_department)),
    'overdue_actions', (SELECT count(*) FROM actions a, org WHERE a.company_id = org.id
                       AND a.status IN ('active','in_progress','awaiting_verification') AND a.due_date < current_date
                       AND a.source_type IN ('incident','investigation','hazard','risk_assessment','method_statement','coshh_assessment',
                                             'riddor_review','audit','audit_finding','inspection','equipment_inspection','hs_check')
                       AND (p_site IS NULL OR a.site_id = p_site)),
    'awaiting_verification', (SELECT count(*) FROM actions a, org WHERE a.company_id = org.id AND a.status = 'awaiting_verification'
                       AND (p_site IS NULL OR a.site_id = p_site)),
    'riddor_review_required', (SELECT count(*) FROM hs_incidents i, org WHERE i.company_id = org.id
                       AND i.riddor_review_status IN ('review_required','potentially_reportable','confirmed_reportable')
                       AND i.status NOT IN ('closed','archived')
                       AND (p_site IS NULL OR i.site_id = p_site) AND (p_department IS NULL OR i.department_id = p_department))
  )
$$;
REVOKE ALL ON FUNCTION public.hs_safety_overview(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_safety_overview(uuid, uuid, date, date) TO authenticated;

-- Grouped counts for the Analysis page. Each key is a list of
-- {k, n} (k = the vocabulary value or the row's name). Period applies
-- to incidents and actions raised; registers are as they stand today.
CREATE OR REPLACE FUNCTION public.hs_safety_breakdowns(p_site uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH org AS (SELECT public.my_company_id() AS id),
  lim AS (SELECT COALESCE(p_from, (current_date - interval '12 months')::date) AS f, COALESCE(p_to, current_date) AS t),
  hz AS (SELECT h.* FROM hazards h, org WHERE h.company_id = org.id AND h.status <> 'archived' AND (p_site IS NULL OR h.site_id = p_site)),
  inc AS (SELECT i.* FROM hs_incidents i, org, lim WHERE i.company_id = org.id AND i.occurred_on BETWEEN lim.f AND lim.t
            AND (p_site IS NULL OR i.site_id = p_site)),
  act AS (SELECT a.* FROM actions a, org, lim WHERE a.company_id = org.id AND a.created_at::date BETWEEN lim.f AND lim.t
            AND a.status <> 'dismissed'
            AND a.source_type IN ('incident','investigation','hazard','risk_assessment','method_statement','coshh_assessment',
                                  'riddor_review','audit','audit_finding','inspection','equipment_inspection','hs_check')
            AND (p_site IS NULL OR a.site_id = p_site))
  SELECT jsonb_build_object(
    'period_from', (SELECT f FROM lim), 'period_to', (SELECT t FROM lim),
    'hazards_by_category', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', k, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT COALESCE(c.name, 'Uncategorised') k, count(*) n FROM hz LEFT JOIN hazard_categories c ON c.id = hz.hazard_category_id GROUP BY 1) x),
    'hazards_by_site', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', k, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT COALESCE(s.name, 'No site') k, count(*) n FROM hz LEFT JOIN hs_sites s ON s.id = hz.site_id GROUP BY 1) x),
    'hazards_by_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', status, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT status, count(*) n FROM hz GROUP BY 1) x),
    'ra_by_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', status, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT ra.status, count(*) n FROM risk_assessments ra, org WHERE ra.company_id = org.id AND ra.status <> 'superseded'
           AND (p_site IS NULL OR ra.site_id = p_site) GROUP BY 1) x),
    'overdue_assessments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'reference', reference, 'title', title, 'review_date', review_date) ORDER BY review_date), '[]') FROM (
        SELECT 'risk_assessment' kind, ra.id, ra.reference, ra.title, ra.review_date FROM risk_assessments ra, org WHERE ra.company_id = org.id
           AND ra.status IN ('approved','active','review_due') AND ra.review_date < current_date AND (p_site IS NULL OR ra.site_id = p_site)
        UNION ALL
        SELECT 'coshh_assessment', c.id, c.reference, c.title, c.review_date FROM coshh_assessments c, org WHERE c.company_id = org.id
           AND c.status IN ('approved','active','review_due') AND c.review_date < current_date AND (p_site IS NULL OR c.site_id = p_site)
        UNION ALL
        SELECT 'method_statement', m.id, m.reference, m.title, m.review_date FROM method_statements m, org WHERE m.company_id = org.id
           AND m.status IN ('approved','active') AND m.review_date < current_date AND (p_site IS NULL OR m.site_id = p_site)
        LIMIT 200) x),
    'high_residual_risks', (SELECT COALESCE(jsonb_agg(jsonb_build_object('ra_id', ra_id, 'reference', reference, 'title', title,
                                'hazard', hazard, 'score', score, 'level', level) ORDER BY score DESC), '[]') FROM (
        SELECT ra.id ra_id, ra.reference, ra.title, left(i.hazard_description, 120) hazard,
               COALESCE(i.residual_risk_score, i.initial_risk_score) score,
               public.hs_risk_level(m.bands, COALESCE(i.residual_risk_score, i.initial_risk_score)) level
          FROM risk_assessment_items i JOIN risk_assessments ra ON ra.id = i.risk_assessment_id
          JOIN risk_matrices m ON m.id = ra.risk_matrix_id, org
         WHERE ra.company_id = org.id AND ra.status IN ('approved','active','review_due') AND i.status <> 'not_required'
           AND (p_site IS NULL OR ra.site_id = p_site)
           AND public.hs_risk_level(m.bands, COALESCE(i.residual_risk_score, i.initial_risk_score)) IN ('high','very_high')
         ORDER BY 5 DESC LIMIT 50) x),
    'incidents_by_type', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', incident_type, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT incident_type, count(*) n FROM inc GROUP BY 1) x),
    'incidents_by_site', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', k, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT COALESCE(s.name, 'No site') k, count(*) n FROM inc LEFT JOIN hs_sites s ON s.id = inc.site_id GROUP BY 1) x),
    'incidents_by_severity', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', k, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT CASE WHEN severity_confirmed_at IS NULL THEN 'unconfirmed' ELSE severity END k, count(*) n FROM inc GROUP BY 1) x),
    'near_miss_trend', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', to_char(mo, 'YYYY-MM'), 'n', n, 'incidents', ni) ORDER BY mo), '[]') FROM (
        SELECT date_trunc('month', occurred_on)::date mo,
               count(*) FILTER (WHERE incident_type = 'near_miss') n,
               count(*) FILTER (WHERE incident_type <> 'near_miss') ni FROM inc GROUP BY 1) x),
    'investigations_by_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', status, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT v.status, count(*) n FROM incident_investigations v JOIN hs_incidents i ON i.id = v.incident_id, org
         WHERE v.company_id = org.id AND (p_site IS NULL OR i.site_id = p_site) GROUP BY 1) x),
    'riddor_by_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('k', riddor_review_status, 'n', n) ORDER BY n DESC), '[]') FROM (
        SELECT riddor_review_status, count(*) n FROM inc WHERE riddor_review_status <> 'not_reviewed' GROUP BY 1) x),
    'actions', (SELECT jsonb_build_object(
        'raised', count(*),
        'complete', count(*) FILTER (WHERE status = 'complete'),
        'complete_on_time', count(*) FILTER (WHERE status = 'complete' AND (due_date IS NULL OR completed_at::date <= due_date)),
        'open', count(*) FILTER (WHERE status IN ('active','in_progress','awaiting_verification')),
        'overdue', count(*) FILTER (WHERE status IN ('active','in_progress','awaiting_verification') AND due_date < current_date),
        'awaiting_verification', count(*) FILTER (WHERE status = 'awaiting_verification'),
        'cancelled', count(*) FILTER (WHERE status = 'cancelled')) FROM act),
    'overdue_actions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date, 'status', status,
                          'source_type', source_type, 'source_id', source_id) ORDER BY due_date), '[]') FROM (
        SELECT a.id, a.title, a.due_date, a.status, a.source_type, a.source_id FROM actions a, org WHERE a.company_id = org.id
           AND a.status IN ('active','in_progress','awaiting_verification') AND a.due_date < current_date
           AND a.source_type IN ('incident','investigation','hazard','risk_assessment','method_statement','coshh_assessment',
                                 'riddor_review','audit','audit_finding','inspection','equipment_inspection','hs_check')
           AND (p_site IS NULL OR a.site_id = p_site)
         ORDER BY a.due_date LIMIT 200) x)
  )
$$;
REVOKE ALL ON FUNCTION public.hs_safety_breakdowns(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_safety_breakdowns(uuid, date, date) TO authenticated;
