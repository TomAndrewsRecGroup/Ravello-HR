import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import EmailSettingsForm from './EmailSettingsForm';
import NotificationPrefsForm from '@/components/modules/NotificationPrefsForm';

export const metadata: Metadata = { title: 'Email Settings' };
export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Layout already redirects unauthenticated TPS users; safe to skip here.

  const [{ data: row }, { data: prefs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass_enc,smtp_from_name,smtp_from_email,smtp_reply_to,email_signature_html,smtp_last_verified_at')
      .eq('id', user?.id ?? '')
      .single(),
    supabase
      .from('notification_preferences')
      .select('email_mode, muted_types, weekly_summary')
      .eq('user_id', user?.id ?? '')
      .maybeSingle(),
  ]);

  return (
    <>
      <AdminTopbar
        title="Email Settings"
        subtitle="Send outbound emails from your own SMTP — falls back to Core OS 360 Resend when unset."
      />
      <main className="admin-page flex-1 space-y-6">
        <div className="card p-6">
          <p className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>Notifications</p>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
            How the platform emails you about client activity, overdue items and reminders. Staff default to one daily summary.
          </p>
          <NotificationPrefsForm
            userId={user?.id ?? ''}
            initial={{
              email_mode:     (prefs as any)?.email_mode ?? 'daily',
              muted_types:    (prefs as any)?.muted_types ?? [],
              weekly_summary: (prefs as any)?.weekly_summary ?? true,
            }}
          />
        </div>
        <EmailSettingsForm
          initial={{
            smtp_host:             row?.smtp_host             ?? '',
            smtp_port:             row?.smtp_port             ?? 587,
            smtp_secure:           row?.smtp_secure           ?? true,
            smtp_user:             row?.smtp_user             ?? '',
            has_pass:              Boolean(row?.smtp_pass_enc),
            smtp_from_name:        row?.smtp_from_name        ?? '',
            smtp_from_email:       row?.smtp_from_email       ?? '',
            smtp_reply_to:         row?.smtp_reply_to         ?? '',
            email_signature_html:  row?.email_signature_html  ?? '',
            smtp_last_verified_at: row?.smtp_last_verified_at ?? null,
          }}
          ownEmail={user?.email ?? ''}
        />
      </main>
    </>
  );
}
