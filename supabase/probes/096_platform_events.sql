-- Probe for 096. As a client session, raises a service request and
-- completes an action; as a provider-less staff-free system, records a
-- FAILED H&S completion. Then checks what the outbox and the register
-- say. Ends in RAISE, so everything rolls back.
--
-- Expected lines:
--   service_requests.created by client: 1 (payload has subject, no details)
--   actions.updated changed=[status]: 1
--   client cannot read platform_events: 0 rows
--   client cannot insert platform_events: blocked
--   failed completion: status in_review, due_date unchanged, last_completed_on unchanged
--   then pass: status pending, due one year on, last_completed today
--   claim: 3 claimed (action created + updated, request created), attempts=1,
--   second claim within lease: 0
--
-- Run live 2026-09-25 against production (rolled back): every line as expected.

DO $$
DECLARE r text := '';
  co      uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';   -- a client company
  client  uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';   -- client_admin of co
  sr uuid; act uuid; item uuid; ev record; n int; d date; lc date; st text;
BEGIN
  -- setup as the SQL editor
  INSERT INTO actions (company_id, action_type, title, priority) VALUES (co, 'manual', 'Probe action', 'normal') RETURNING id INTO act;
  INSERT INTO compliance_items (company_id, title, category, due_date, recurrence_every, recurrence_unit, last_completed_on)
    VALUES (co, 'Probe fire alarm', 'hs_fire', '2026-12-01', 1, 'year', '2025-12-01') RETURNING id INTO item;

  -- ── as the client ──────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO service_requests (company_id, submitted_by, request_type, subject, details, urgency)
    VALUES (co, client, 'hr_audit', 'Probe request', '{"message":"SECRET BODY"}'::jsonb, 'high') RETURNING id INTO sr;
  UPDATE actions SET status = 'complete', completed_at = now() WHERE id = act;

  SELECT count(*) INTO n FROM platform_events; r := r || 'client reads platform_events: ' || n || ' rows; ';
  BEGIN
    INSERT INTO platform_events (entity_type, event_type) VALUES ('x', 'created');
    r := r || 'client insert platform_events: ALLOWED (BAD); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client insert platform_events: blocked; ';
  END;

  -- ── back to the editor ─────────────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT * INTO ev FROM platform_events WHERE entity_type = 'service_requests' AND entity_id = sr;
  r := r || 'service_requests.created by ' || ev.actor_kind || ': ' || (ev.payload->'new'->>'subject') || ', details present: ' || (ev.payload->'new' ? 'details')::text || '; ';
  SELECT * INTO ev FROM platform_events WHERE entity_type = 'actions' AND entity_id = act AND event_type = 'updated';
  r := r || 'actions.updated changed=' || (ev.payload->>'changed') || ' old=' || (ev.payload->'old'->>'status') || '; ';

  -- X8: a failed completion must not roll the item forward
  INSERT INTO hs_register_completions (item_id, company_id, completed_on, outcome) VALUES (item, co, current_date, 'fail');
  SELECT status::text, due_date, last_completed_on INTO st, d, lc FROM compliance_items WHERE id = item;
  r := r || 'failed completion: status ' || st || ', due ' || d || ', last_completed ' || lc || '; ';
  INSERT INTO hs_register_completions (item_id, company_id, completed_on, outcome) VALUES (item, co, current_date, 'pass');
  SELECT status::text, due_date, last_completed_on INTO st, d, lc FROM compliance_items WHERE id = item;
  r := r || 'then pass: status ' || st || ', due ' || d || ', last_completed ' || lc || '; ';

  -- the claim
  SELECT count(*) INTO n FROM claim_platform_events(10, interval '10 minutes') WHERE entity_id IN (sr, act);
  r := r || 'claimed: ' || n || '; ';
  SELECT count(*) INTO n FROM claim_platform_events(10, interval '10 minutes') WHERE entity_id IN (sr, act);
  r := r || 'second claim within lease: ' || n || '; ';
  SELECT attempts INTO n FROM platform_events WHERE entity_id = sr; r := r || 'attempts: ' || n || '; ';

  RAISE EXCEPTION 'PROBE RESULT: %', r;
END $$;
