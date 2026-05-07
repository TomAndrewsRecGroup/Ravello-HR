import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildEnquiryEmail, buildAdminNotification, type EnquirySource } from '@/lib/emails/enquiry';

export const runtime = 'nodejs';

const Schema = z.object({
  fullName:    z.string().trim().min(2,  'Full name required'),
  email:       z.string().trim().email('Valid email required'),
  phone:       z.string().trim().min(5,  'Phone required'),
  companyName: z.string().trim().min(1,  'Company name required'),
  source:      z.enum(['hiring_score','hr_risk','policy_healthcheck','due_diligence','contact']),
  result:      z.record(z.unknown()).optional(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Schema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  const { fullName, email, phone, companyName, source, result } = parsed.data;
  const userAgent = req.headers.get('user-agent') ?? null;

  const supabase = getSupabase();
  if (!supabase) {
    // Hard fail: without a DB we'd lose the lead silently. Mis-config
    // beats appearing-to-succeed.
    console.error('[enquiries] Supabase env not configured');
    return NextResponse.json({
      ok:    false,
      error: 'Service temporarily unavailable. Please try again or email us directly.',
    }, { status: 503 });
  }

  const { error: dbErr } = await supabase.from('enquiries').insert({
    full_name:    fullName,
    email,
    phone,
    company_name: companyName,
    source,
    result:       result ?? {},
    user_agent:   userAgent,
  });

  if (dbErr) {
    // Persistence is the contract — without it the lead is lost.
    // Return non-200 so the visitor knows to retry rather than seeing
    // a green 'thanks' state for a submission that was dropped.
    console.error('[enquiries] insert failed:', dbErr.message);
    return NextResponse.json({
      ok:    false,
      error: 'We could not record your details. Please try again — or email info@thepeoplesystem.co.uk.',
    }, { status: 500 });
  }

  // Emails are a side-effect: Promise.allSettled so one failure
  // doesn't drop the other, and we surface partial success to the
  // caller. The lead is already saved at this point so the API
  // remains 200 even when the visitor email fails — the operator
  // sees the row in /enquiries and can follow up manually.
  const resendKey = process.env.RESEND_API_KEY;
  let visitorEmail: 'sent' | 'failed' | 'skipped' = 'skipped';
  let adminEmail:   'sent' | 'failed' | 'skipped' = 'skipped';

  if (resendKey) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendKey);
      const from   = process.env.EMAIL_FROM        ?? 'The People System <results@portal.thepeoplesystem.co.uk>';
      const notify = process.env.LEAD_NOTIFY_EMAIL ?? 'info@thepeoplesystem.co.uk';

      const visitor = buildEnquiryEmail({ fullName, source: source as EnquirySource, result });
      const admin   = buildAdminNotification({ fullName, email, phone, companyName, source: source as EnquirySource, result });

      const [visRes, admRes] = await Promise.allSettled([
        resend.emails.send({ from, to: email,  subject: visitor.subject, html: visitor.html, reply_to: notify }),
        resend.emails.send({ from, to: notify, subject: admin.subject,   html: admin.html,   reply_to: email  }),
      ]);
      visitorEmail = visRes.status === 'fulfilled' ? 'sent' : 'failed';
      adminEmail   = admRes.status === 'fulfilled' ? 'sent' : 'failed';
      if (visRes.status === 'rejected') console.error('[enquiries] visitor email rejected:', visRes.reason);
      if (admRes.status === 'rejected') console.error('[enquiries] admin email rejected:',   admRes.reason);
    } catch (err) {
      console.error('[enquiries] Resend init failed:', err);
      visitorEmail = 'failed';
      adminEmail   = 'failed';
    }
  }

  return NextResponse.json({
    ok: true,
    visitor_email: visitorEmail,
    admin_email:   adminEmail,
  });
}
