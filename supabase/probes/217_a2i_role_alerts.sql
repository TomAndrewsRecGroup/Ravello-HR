-- Probe for migration 217 (Athletes To Industry Thursday role email).
-- Run inside a transaction; the final RAISE rolls everything back.
-- Ran live 2026-10-28: 9/9 checks passed, no rows left behind.
DO $$
DECLARE v_client uuid; v_athlete uuid; v_send uuid; v_n int;
BEGIN
  SELECT id INTO v_client FROM profiles WHERE role <> 'tps_admin' AND role IS NOT NULL LIMIT 1;
  SELECT id INTO v_athlete FROM athletes LIMIT 1;
  INSERT INTO a2i_role_alert_sends (week_key) VALUES ('2099-W01') RETURNING id INTO v_send;
  INSERT INTO a2i_role_alert_deliveries (send_id, athlete_id, email_lower) VALUES (v_send, v_athlete, 'probe@example.com');
  BEGIN
    INSERT INTO a2i_role_alert_deliveries (send_id, athlete_id, email_lower) VALUES (v_send, v_athlete, 'probe@example.com');
    RAISE EXCEPTION 'CHECK1 FAIL: duplicate delivery accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'CHECK1 ok: duplicate delivery refused';
  END;
  BEGIN
    INSERT INTO a2i_role_alert_sends (week_key) VALUES ('2099-W01');
    RAISE EXCEPTION 'CHECK2 FAIL: second send for same week accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'CHECK2 ok: one send per week';
  END;
  INSERT INTO a2i_role_interests (athlete_id, send_id, manatal_job_id, position_name) VALUES (v_athlete, v_send, '4467043', 'Probe role');
  BEGIN
    INSERT INTO a2i_role_interests (athlete_id, send_id, manatal_job_id, position_name) VALUES (v_athlete, v_send, '4467043', 'Probe role');
    RAISE EXCEPTION 'CHECK3 FAIL: duplicate interest accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'CHECK3 ok: one interest per athlete per role';
  END;
  BEGIN
    INSERT INTO a2i_role_alert_optouts (email_lower, source) VALUES ('Mixed@Case.com', 'link');
    RAISE EXCEPTION 'CHECK4 FAIL: non-lowercase opt-out accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'CHECK4 ok: opt-outs must be lower-case';
  END;
  BEGIN
    UPDATE a2i_role_alert_config SET role_url_template = 'http://evil.example/{id}';
    RAISE EXCEPTION 'CHECK5 FAIL: non-https template accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'CHECK5 ok: https-only role links';
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM a2i_role_alert_config;
  IF v_n <> 0 THEN RAISE EXCEPTION 'CHECK6 FAIL: client sees config'; END IF;
  RAISE NOTICE 'CHECK6 ok: client cannot read config';
  SELECT count(*) INTO v_n FROM a2i_role_alert_deliveries;
  IF v_n <> 0 THEN RAISE EXCEPTION 'CHECK7 FAIL: client sees deliveries'; END IF;
  RAISE NOTICE 'CHECK7 ok: client cannot read deliveries';
  BEGIN
    PERFORM 1 FROM a2i_role_alert_tokens;
    RAISE EXCEPTION 'CHECK8 FAIL: authenticated can read tokens';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'CHECK8 ok: tokens unreadable by sessions';
  END;
  BEGIN
    INSERT INTO a2i_role_alert_optouts (email_lower, source) VALUES ('x@y.com', 'link');
    RAISE EXCEPTION 'CHECK9 FAIL: client inserted opt-out';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'CHECK9 ok: client cannot write opt-outs';
  END;
  RESET ROLE;
  RAISE EXCEPTION 'ROLLBACK_PROBE all checks passed';
END $$;
