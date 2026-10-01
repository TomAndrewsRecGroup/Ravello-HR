-- Connective-tissue fix: raise-invoice's own `package` vocabulary
-- (HIRE/LEAD/PROTECT/OTHER, migration 065) predates the Consultancy
-- Command Centre (Phase 6) and the staff-delivered H&S service line
-- (Phase 18's own "Core OS 360 offering clients a Health & Safety
-- Solution" pivot) — neither has a real invoice bucket today, so
-- staff raising a one-off invoice for H&S/workforce/consultancy work
-- has nothing to pick but the free-text 'OTHER' catch-all.
--
-- Checked live before writing this: one_off_invoices had 0 rows, so
-- the CHECK is tightened directly rather than needing an "after
-- deploy" step.

ALTER TABLE public.one_off_invoices DROP CONSTRAINT one_off_invoices_package_check;
ALTER TABLE public.one_off_invoices
  ADD CONSTRAINT one_off_invoices_package_check
  CHECK (package IN ('HIRE', 'LEAD', 'PROTECT', 'CONSULTANCY', 'OTHER'));
