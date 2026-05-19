import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import EmailSettingsForm from './EmailSettingsForm';

export const metadata: Metadata = { title: 'Email Settings' };
export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Layout already redirects unauthenticated TPS users; safe to skip here.

  const { data: row } = await supabase
    .from('profiles')
    .select('email,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass_enc,smtp_from_name,smtp_from_email,smtp_reply_to,email_signature_html,smtp_last_verified_at')
    .eq('id', user?.id ?? '')
    .single();

  return (
    <>
      <AdminTopbar
        title="Email Settings"
        subtitle="Send outbound emails from your own SMTP — falls back to The People System Resend when unset."
      />
      <main className="admin-page flex-1">
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
