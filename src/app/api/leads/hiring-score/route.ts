import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const HiringScoreSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().optional(),
  score: z.number().optional(),
  maxScore: z.number().optional(),
  percentage: z.number().optional(),
  weakAreas: z.array(z.string()).optional(),
  answers: z.record(z.unknown()).optional(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = HiringScoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 },
      );
    }

    const { email, name, score, maxScore, percentage, weakAreas, answers } = parsed.data;

    // Store lead
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('leads').insert({
        email,
        name: name ?? null,
        source: 'hiring_score',
        metadata: { score, maxScore, percentage, weakAreas, answers },
      });
    }

    // Send results email via Resend (if configured)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && email) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'results@thepeoplesystem.co.uk',
          to: email,
          subject: `Your Smart Hiring Score: ${percentage ?? 0}%`,
          html: `
            <h2>Hi ${name ?? 'there'},</h2>
            <p>Thanks for taking the Smart Hiring Score assessment.</p>
            <p>Your score: <strong>${score ?? 0} / ${maxScore ?? 10}</strong> (${percentage ?? 0}%)</p>
            ${weakAreas?.length ? `<p>Areas to improve: ${weakAreas.join(', ')}</p>` : ''}
            <p>Want to discuss your results? <a href="https://thepeoplesystem.co.uk/book">Book a free call</a></p>
            <p>Best,<br>The People System</p>
          `,
        });
      } catch (emailErr) {
        console.error('[hiring-score] Resend email failed:', emailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
