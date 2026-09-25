-- ═══════════════════════════════════════════════════════════
-- 096a: email_log_target gains 'user', 'provider', 'employee'
-- ═══════════════════════════════════════════════════════════
-- Alone in its own file: a value added by ADD VALUE cannot be used in
-- the same transaction (the 090 precedent). Apply BEFORE 096.
--
-- The notification engine (096) emails staff and client users about
-- events, and email_log records every send. Its target enum only knew
-- athletes, companies and candidates, so a notification email to a
-- profile had no honest target_type.

ALTER TYPE email_log_target ADD VALUE IF NOT EXISTS 'user';
ALTER TYPE email_log_target ADD VALUE IF NOT EXISTS 'provider';
ALTER TYPE email_log_target ADD VALUE IF NOT EXISTS 'employee';
