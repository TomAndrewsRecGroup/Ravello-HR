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

## Notes

- All templates use the same logo URL and brand colours as the in-app
  emails in `admin/src/lib/email/`. Keep them in sync if either changes.
- Supabase substitutes the `{{ .ConfirmationURL }}` token at send time
  with the real auth link. Don't change that token name.
- The `{{ .NewEmail }}` token is only valid in `05-change-email.html`.
- Subject lines do not support tokens — keep them static.
- Sender address is configured in **Authentication → SMTP Settings**,
  not in these templates. Set it once there (e.g.
  `noreply@thepeoplesystem.co.uk`) and it applies to all five.
