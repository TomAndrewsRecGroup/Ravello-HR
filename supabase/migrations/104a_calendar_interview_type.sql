-- ═══════════════════════════════════════════════════════════
-- 104a: calendar_event_type gains 'interview'
-- ═══════════════════════════════════════════════════════════
-- Alone in its own file, as 090 and 096a were: a value added by
-- ADD VALUE cannot be used in the same transaction, and 104 does not
-- use it either — the event consumer writes it at runtime when an
-- interview is scheduled (lib/events/hireRules.ts), so the client's
-- calendar shows the interview alongside leave and closed days.

ALTER TYPE public.calendar_event_type ADD VALUE IF NOT EXISTS 'interview';
