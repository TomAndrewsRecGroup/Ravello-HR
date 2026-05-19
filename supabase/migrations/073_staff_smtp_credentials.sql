-- ═══════════════════════════════════════════════════════════
-- Phase 73: Per-staff SMTP credentials + email signature
--
-- Each TPS admin user gets their own SMTP config so outbound
-- emails (Dev Plans, candidate shares, custom messages) can be
-- sent from their actual address — better deliverability + the
-- recipient sees who really sent it.
--
-- Resend stays as the default fallback for staff who haven't
-- configured SMTP, and for system emails like welcome / invite.
--
-- smtp_pass_enc is stored AES-256-GCM-encrypted with a master
-- key held in env (SMTP_PASS_ENCRYPTION_KEY). Decryption happens
-- only inside the send route and is never returned to the
-- client. The settings UI shows a placeholder dot string.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS smtp_host             TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port             INTEGER,
  ADD COLUMN IF NOT EXISTS smtp_secure           BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS smtp_user             TEXT,
  ADD COLUMN IF NOT EXISTS smtp_pass_enc         TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_name        TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_email       TEXT,
  ADD COLUMN IF NOT EXISTS smtp_reply_to         TEXT,
  ADD COLUMN IF NOT EXISTS email_signature_html  TEXT,
  ADD COLUMN IF NOT EXISTS smtp_last_verified_at TIMESTAMPTZ;
