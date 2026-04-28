# Supabase Auth Email Templates

Branded HTML for the 5 emails Supabase Auth sends directly (which our
in-app code can't intercept because they carry one-time auth tokens).

## How to install

For each file in this directory:

1. Open the **Supabase dashboard** → your project → **Authentication** → **Email Templates**
2. Pick the matching template type from the dropdown:
   - `01-confirm-signup.html`     → **Confirm signup**
   - `02-invite-user.html`        → **Invite user**
   - `03-magic-link.html`         → **Magic Link**
   - `04-reset-password.html`     → **Reset Password**
   - `05-change-email.html`       → **Change Email Address**
3. Copy the **subject line** from the first comment in each file (the line that starts `<!-- SUBJECT:`) into the **Subject** field
4. Paste the **rest of the file** (the `<!DOCTYPE html>` block onwards) into the message body
5. Click **Save**

## Why these templates show a 6-digit code

Modern corporate email scanners (Outlook Safe Links, Gmail's anti-
phishing scanner, Mimecast, Proofpoint, antivirus tools) pre-fetch
every link in incoming email to scan for malware. Supabase's verify
endpoint consumes the one-time token on first GET — so the link
appears "already expired" by the time the user clicks. Codes can't
be prefetched, so the OTP path is bulletproof.

The `02-invite-user.html` and `04-reset-password.html` templates
display both the magic link (button) AND a numeric `{{ .Token }}`.
Users whose email isn't being scanned can click the button as
before; users in scanner-protected environments can type the code
into the portal forms.

The portal accepts any code length between 6 and 10 digits to
match Supabase's `MAILER_OTP_LENGTH` (default 6, configurable up
to 10 in Authentication → Providers → Email).

The portal handles both:

| Where the user enters the code | Page |
|---|---|
| Reset password code | /auth/reset-password (step 2 after requesting) |
| Invitation code | /auth/accept-invite |

The other three templates (`01-confirm-signup`, `03-magic-link`,
`05-change-email`) keep the link-only pattern — those flows aren't
currently wired into the portal as OTP.

## URL Configuration prerequisites

In **Authentication → URL Configuration**:

- **Site URL** must include the `https://` scheme. Bare hostnames like
  `www.portal.thepeoplesystem.co.uk` will not work — Supabase needs a
  full absolute URL. Set it to `https://www.portal.thepeoplesystem.co.uk`
  (no trailing slash).
- **Redirect URLs** must also include `https://`. Examples:
  - `https://www.portal.thepeoplesystem.co.uk/auth/update-password`
  - `https://www.portal.thepeoplesystem.co.uk/auth/callback`
  - simplest catch-all: `https://www.portal.thepeoplesystem.co.uk/**`

Site URL and `NEXT_PUBLIC_PORTAL_URL` (Vercel admin project env var)
must match exactly — same scheme, same www/non-www. Mismatch causes
Supabase to drop the redirect_to and fall back to the Site URL.

## Notes

- All templates use the same logo URL and brand colours as the in-app
  emails in `admin/src/lib/email/`. Keep them in sync if either changes.
- Subject lines do not support tokens — keep them static.
- Sender address is configured in **Authentication → SMTP Settings**,
  not in these templates. Set it once there (e.g.
  `noreply@thepeoplesystem.co.uk`) and it applies to all five.
- The `{{ .NewEmail }}` token is only valid in `05-change-email.html`.
