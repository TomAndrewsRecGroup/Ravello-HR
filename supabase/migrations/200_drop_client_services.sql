-- Retire client_services (002). Checked live before writing this
-- migration: 0 rows, ever, and no INSERT path anywhere in either app's
-- source (confirmed by a full-repo grep) — its own UI tab was removed
-- at some earlier point and nothing ever noticed the table itself had
-- become dead. Its three readers (the admin client-tab-data API's
-- unreachable 'Services' case, the portal dashboard's always-empty
-- "Active Services" panel, the Value Report's own MRR calculation)
-- are all removed in the same change that ships this migration — see
-- CLAUDE.md's "retire client_services" entry. The real retainer figure
-- is, and always was, companies.monthly_retainer_pence.
--
-- `update_updated_at()` (001) is shared by 10+ other tables and is NOT
-- dropped — only this table, which drops its own trigger with it.

DROP TABLE IF EXISTS public.client_services CASCADE;
