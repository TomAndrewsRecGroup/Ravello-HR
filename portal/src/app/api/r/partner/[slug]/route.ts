import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail, buildPartnerReferralEmail } from '@/lib/email';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { getServiceClient, findReferralCompany, PARTNER_NOTIFY_EMAIL } from '@/lib/referral';

export const runtime = 'nodejs';

const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

const PartnerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  location: z.string().trim().max(200).optional().default(''),
  website: z.string().trim().max(300).optional().default(''),
  sector: z.string().trim().max(200).optional().default(''),
  opportunities: z.string().trim().max(5000).optional().default(''),
  company: z.string().optional().default(''), // honeypot
});

// Public, unauthenticated. Email-only — no database write. Notifies Tom and
// records which client referred the partner (resolved from the slug).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!limiter.check(getRateLimitKey(req)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PartnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Honeypot — pretend success.
  if (data.company.trim()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const company = await findReferralCompany(supabase, params.slug);
  if (!company) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const tpl = buildPartnerReferralEmail({
    to: PARTNER_NOTIFY_EMAIL,
    referrerCompany: company.name,
    name: data.name,
    location: data.location,
    website: data.website,
    sector: data.sector,
    opportunities: data.opportunities,
  });

  // Best-effort: if Resend is unconfigured sendEmail returns null and logs;
  // we still report success so the partner gets a clean experience.
  await sendEmail(tpl).catch((err) =>
    console.error('[referral-partner] email send failed', err),
  );

  return NextResponse.json({ ok: true });
}
