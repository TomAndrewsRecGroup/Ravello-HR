-- ═══════════════════════════════════════════════════════════
-- USER UI PREFERENCES
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}';
-- Structure:
-- {
--   "sidebar_order":   ["/dashboard", "/hire", "/lead", ...],
--   "sidebar_hidden":  ["/calendar"],
--   "quick_actions":   ["raise_role", "log_leave", "raise_ticket", "upload_doc"],
--   "pinned_pages":    ["/hire/hiring", "/lead/employee-records"]
-- }
