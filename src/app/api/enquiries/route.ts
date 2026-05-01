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
  if (supabase) {
    const { error } = await supabase.from('enquiries').insert({
      full_name:    fullName,
      email,
      phone,
      company_name: companyName,
      source,
      result:       result ?? {},
      user_agent:   userAgent,
    });
    if (error) {
      console.error('[enquiries] insert failed:', error.message);
    }
  }

  // Send branded results email to the visitor + notification to TPS.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendKey);
      const from   = process.env.EMAIL_FROM        ?? 'The People System <results@thepeoplesystem.co.uk>';
      const notify = process.env.LEAD_NOTIFY_EMAIL ?? 'info@thepeoplesystem.co.uk';

      const visitor = buildEnquiryEmail({ fullName, source: source as EnquirySource, result });
      const admin   = buildAdminNotification({ fullName, email, phone, companyName, source: source as EnquirySource, result });

      await Promise.all([
        resend.emails.send({ from, to: email,  subject: visitor.subject, html: visitor.html, replyTo: notify }),
        resend.emails.send({ from, to: notify, subject: admin.subject,   html: admin.html,   replyTo: email  }),
      ]);
    } catch (err) {
      console.error('[enquiries] Resend send failed:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
