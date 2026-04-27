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

## How the link is built (and why it matters)

The button URL in each template is constructed manually like:

```
{{ .SiteURL }}/auth/v1/verify?token={{ .TokenHash }}&type=<TYPE>&redirect_to={{ .RedirectTo }}
```

The `<TYPE>` differs per template:

| Template | type value |
|---|---|
| Confirm signup | `signup` |
| Invite user | `invite` |
| Magic Link | `magiclink` |
| Reset Password | `recovery` |
| Change Email | `email_change` |

We use this explicit form rather than `{{ .ConfirmationURL }}` because
Supabase's auto-built URL doesn't always honour the `redirect_to` we
pass via the API call (most notably on the recovery flow). Building
the URL manually with `{{ .RedirectTo }}` baked in guarantees the
user lands at the right page after Supabase verifies the token.

## URL Configuration prerequisites

In **Authentication → URL Configuration**:

- **Site URL** = `https://portal.thepeoplesystem.co.uk`
- **Redirect URLs** must include (or match via wildcard):
  - `https://portal.thepeoplesystem.co.uk/auth/callback`
  - `https://portal.thepeoplesystem.co.uk/auth/update-password`
  - simplest: `https://portal.thepeoplesystem.co.uk/**`

Without these, Supabase strips the `redirect_to` and falls back to
the Site URL.

## Notes

- All templates use the same logo URL and brand colours as the in-app
  emails in `admin/src/lib/email/`. Keep them in sync if either changes.
- Subject lines do not support tokens — keep them static.
- Sender address is configured in **Authentication → SMTP Settings**,
  not in these templates. Set it once there (e.g.
  `noreply@thepeoplesystem.co.uk`) and it applies to all five.
- The `{{ .NewEmail }}` token is only valid in `05-change-email.html`.
