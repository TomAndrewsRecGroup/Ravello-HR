import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const LeadSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().optional(),
  source: z.string().default('website'),
  company: z.string().optional(),
  problemType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 },
      );
    }

    const { email, name, source, company, problemType, metadata } = parsed.data;

    // Store in Supabase
    const supabase = getSupabase();
    if (supabase) {
      const { error: dbErr } = await supabase.from('leads').insert({
        email,
        name: name ?? null,
        source,
        company: company ?? null,
        problem_type: problemType ?? null,
        metadata: metadata ?? {},
      });

      if (dbErr) {
        console.error('[leads] DB insert failed:', dbErr.message);
        // Don't fail the request: still count as captured
      }
    }

    // Send notification email via Resend (if configured)
    const resendKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.LEAD_NOTIFY_EMAIL;
    if (resendKey && notifyEmail) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'leads@thepeoplesystem.co.uk',
          to: notifyEmail,
          subject: `New lead: ${email} (${source})`,
          html: `
            <h2>New lead captured</h2>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            ${name ? `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` : ''}
            ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ''}
            <p><strong>Source:</strong> ${escapeHtml(source)}</p>
            ${problemType ? `<p><strong>Problem type:</strong> ${escapeHtml(problemType)}</p>` : ''}
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          `,
        });
      } catch (emailErr) {
        console.error('[leads] Resend notification failed:', emailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
