-- Core-OS 360 Completion Programme, Phase 25, Group 6 (closes gap-ledger
-- row C17.7 — "full flow: research -> human-reviewed regulatory change
-- -> affected clients identified -> reviewed Broadcast -> actions ->
-- acknowledgement/evidence/completion").
--
-- The Broadcast prefill (Phase 5 Group 8, C5.16) already carries a
-- staff-reviewed change from a legal requirement or a classified
-- regulatory update into a compose form and a confirm-and-send step.
-- What was missing was the OTHER end of the chain: once sent, nothing
-- recorded which broadcast a given set of raised actions came from, so
-- there was no way to trace "did the affected clients actually act on
-- this" back to the research that started it.
--
-- `actions.source_type` ALREADY allows 'regulatory_broadcast' (live
-- since an earlier phase's CHECK, confirmed via pg_get_constraintdef
-- before writing this migration — never used by any code until now):
-- that value is reserved for exactly this. This migration adds the
-- other half — recording, on the SEND itself (broadcast_sends, 191),
-- which legal requirement or regulatory update it originated from —
-- so every action `source_id`-linked back to a send can, in turn, be
-- traced back to the research that prompted it.
--
-- Nullable and CHECK-restricted: an ordinary hand-typed broadcast (the
-- overwhelming majority) carries neither column, unchanged from before
-- this migration.

ALTER TABLE public.broadcast_sends
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id   uuid;

ALTER TABLE public.broadcast_sends
  DROP CONSTRAINT IF EXISTS broadcast_sends_source_type_check;
ALTER TABLE public.broadcast_sends
  ADD CONSTRAINT broadcast_sends_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('legal_requirement', 'regulatory_update'));

-- source_id is meaningless without source_type, and vice versa — a
-- half-set pair would silently misrepresent where the broadcast came
-- from.
ALTER TABLE public.broadcast_sends
  DROP CONSTRAINT IF EXISTS broadcast_sends_source_pair_check;
ALTER TABLE public.broadcast_sends
  ADD CONSTRAINT broadcast_sends_source_pair_check
  CHECK ((source_type IS NULL) = (source_id IS NULL));
