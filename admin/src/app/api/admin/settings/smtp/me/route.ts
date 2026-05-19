import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

// GET /api/admin/settings/smtp/me
// Returns whether the calling staff member has SMTP fully configured
// + the from-email if so. Used by SendEmailButton to decide whether
// to surface 'Your SMTP' as a sender option in the modal.
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('smtp_host,smtp_port,smtp_user,smtp_pass_enc,smtp_from_email')
    .eq('id', auth.userId)
    .single();

  const configured = Boolean(
    data?.smtp_host && data.smtp_port && data.smtp_user && data.smtp_pass_enc && data.smtp_from_email,
  );
  return NextResponse.json({
    configured,
    from_email: configured ? data?.smtp_from_email ?? null : null,
  });
}
