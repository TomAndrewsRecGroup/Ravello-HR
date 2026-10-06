-- 212: profiles.phone — a contact number for a staff account owner (or any
-- profile), surfaced on the portal's "Your account contact" card so a
-- client sees not just a name/email but a number to call. No existing
-- column covers this: profiles has only id/email/full_name/role/
-- company_id/avatar_url plus later GDPR/invite-token additions — no
-- phone anywhere. Nullable; nothing populates it until a staff member
-- sets their own.
--
-- Deliberately NOT added to either security-hardening guard's
-- self_service allow-list (088/093): those lists govern what a
-- NON-STAFF caller may change on their OWN row. A new column is
-- staff-only by default until explicitly allow-listed, and this one
-- stays that way — a client has no business setting a staff member's
-- phone number, and staff writes already bypass the allow-list via
-- is_tps_staff(). Verified live before writing this comment: both
-- guard functions' is_tps_staff() exemption is unconditional, not
-- scoped to a named column list, so no trigger change is needed for
-- staff-to-staff edits either.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text CHECK (length(phone) <= 60);
