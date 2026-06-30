import { NextRequest, NextResponse } from 'next/server';
import { buildPatch, CV_MIME_ALLOW, CV_EXT_ALLOW, CV_MAX_BYTES } from '@/lib/athletes/validate';
import { sendEmail, buildAthleteWelcomeEmail, nextBusinessSendAt } from '@/lib/email';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { getServiceClient, findReferralCompany } from '@/lib/referral';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Generous per-IP cap so a script can't flood a client's roster or burn
// Resend quota, but a real athlete double-submitting is never blocked.
const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

const STORAGE_BUCKET = 'athlete-cvs';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}
function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

// Public, unauthenticated. Any athlete can submit against a client's slug;
// the row is created on that client's roster, flagged source = 'referral'.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!limiter.check(getRateLimitKey(req)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  // Honeypot: real users never fill this. Pretend success so bots get no signal.
  if (str(form.get('company')).trim()) {
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

  const fullName = str(form.get('full_name')).trim();
  if (!fullName) {
    return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
  }

  const cvKindRaw = str(form.get('cv_kind'));
  const cvText = str(form.get('cv_text'));
  const patch = buildPatch({
    full_name: fullName,
    email: str(form.get('email')),
    phone: str(form.get('phone')),
    sport: str(form.get('sport')),
    previous_role: str(form.get('previous_role')),
    bio: str(form.get('bio')),
    linkedin_url: str(form.get('linkedin_url')),
    ...(cvKindRaw === 'text' ? { cv_kind: 'text' as const, cv_text: cvText } : {}),
  });
  if ('error' in patch) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const { data: athlete, error: insertErr } = await supabase
    .from('athletes')
    .insert({
      company_id: company.id,
      ...patch,
      created_by: null,
      source: 'referral',
    })
    .select('id, company_id, email, full_name')
    .single();

  if (insertErr || !athlete) {
    return NextResponse.json({ error: insertErr?.message ?? 'Could not save' }, { status: 500 });
  }

  // Optional CV file — best-effort: a failed upload never discards the athlete.
  const file = form.get('file');
  if (file instanceof File && file.size > 0) {
    const ext = extFromName(file.name);
    const okType = CV_MIME_ALLOW.has(file.type);
    const okExt = CV_EXT_ALLOW.has(ext);
    const okSize = file.size <= CV_MAX_BYTES;
    if (okType && okExt && okSize) {
      const path = `${company.id}/${athlete.id}/${Date.now()}_${safeName(file.name)}`;
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (!uploadErr) {
        await supabase
          .from('athletes')
          .update({
            cv_kind: 'file',
            cv_url: null,
            cv_storage_path: path,
            cv_filename: file.name,
            cv_mime: file.type,
            cv_text: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', athlete.id);
      } else {
        console.error('[referral-athlete] CV upload failed', uploadErr.message);
      }
    } else {
      console.warn('[referral-athlete] CV rejected', { okType, okExt, okSize });
    }
  }

  // Queue the existing Athletes To Industry welcome email to the athlete
  // (2 days out, business hours). Best-effort; never blocks the response.
  const recipient = str(form.get('email')).trim();
  if (recipient) {
    const firstName = fullName.split(/\s+/)[0];
    const tpl = buildAthleteWelcomeEmail({ to: recipient, firstName });
    sendEmail({ ...tpl, scheduledAt: nextBusinessSendAt() }).catch((err) =>
      console.error('[referral-athlete] welcome email queue failed', err),
    );
  }

  // Never leak the row to an anonymous caller.
  return NextResponse.json({ ok: true });
}
