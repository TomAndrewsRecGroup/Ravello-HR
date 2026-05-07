import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';

// Per-IP: 30 GETs / 5 POSTs per 5 minutes — tight enough that a bot
// can't realistically enumerate the 32-hex-char token space, loose
// enough that a real employee filling the form (then editing dates)
// won't trip it.
const ipGetLimiter  = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const ipPostLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 5  });

// Per-token: a single employee link should only fire a handful of
// pending submissions per window. After that, rotate the token via
// regenerate-token so a leaked link can't be replayed indefinitely.
const tokenPostLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });

// Public, token-authenticated leave-request flow.
//
// GET  /api/leave/{token}  → minimal payload to render the form
//                            (employee name, company name, allowed types).
// POST /api/leave/{token}  → creates a `pending` absence_records row.
//
// Security model
//   • The browser NEVER talks to Supabase directly for this flow.
//   • All DB access goes through the service-role client, so RLS on
//     employee_records / absence_records stays restrictive (no public
//     read/write policy needed). The token IS the authorisation.
//   • Tokens are 32-char hex (~128 bits). Constant-time match on the
//     server. Lookups are indexed (idx_employee_records_leave_token).
//   • Returned payload is deliberately minimal: no email, phone, salary,
//     contract terms, etc. Just what the form needs to greet the user.

// Allowed leave types — must match ABSENCE_TYPE_LABELS in statusMaps.ts.
const LEAVE_TYPES = [
  'holiday', 'sick', 'maternity', 'paternity',
  'shared_parental', 'compassionate', 'unpaid', 'other',
];

// Token shape: 32-char lowercase hex.
const TOKEN_RE = /^[a-f0-9]{32}$/;

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface Ctx {
  params: { token: string };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const ipKey = getRateLimitKey(request);
  if (!ipGetLimiter.check(ipKey).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const token = params.token;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  const sb = adminClient();
  const { data: emp, error } = await sb
    .from('employee_records')
    .select('id, full_name, company_id, status')
    .eq('leave_token', token)
    .maybeSingle();

  if (error || !emp) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }
  if (emp.status === 'terminated') {
    return NextResponse.json({ error: 'This link is no longer active' }, { status: 410 });
  }

  // Pull just the company name for the greeting. Don't leak anything else.
  const { data: co } = await sb
    .from('companies')
    .select('name')
    .eq('id', emp.company_id)
    .single();

  return NextResponse.json({
    employee:    { name: emp.full_name },
    company:     { name: co?.name ?? '' },
    leave_types: LEAVE_TYPES,
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  // Per-IP limit defends against random token guessing; per-token
  // limit defends against replay/spam from a leaked or shared link.
  const ipKey = getRateLimitKey(request);
  if (!ipPostLimiter.check(ipKey).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const token = params.token;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  if (!tokenPostLimiter.check(token).allowed) {
    return NextResponse.json({
      error: 'Too many submissions on this link recently. Ask your admin to issue a new one.',
    }, { status: 429 });
  }

  let body: { absence_type?: string; start_date?: string; end_date?: string; reason?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const absence_type = (body.absence_type ?? '').trim();
  const start_date   = (body.start_date   ?? '').trim();
  const end_date     = (body.end_date     ?? '').trim();
  const reason       = (body.reason       ?? '').trim() || null;

  if (!LEAVE_TYPES.includes(absence_type)) {
    return NextResponse.json({ error: 'Please pick a leave type.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return NextResponse.json({ error: 'Please give valid start and end dates.' }, { status: 400 });
  }
  if (start_date > end_date) {
    return NextResponse.json({ error: 'Start date must be on or before the end date.' }, { status: 400 });
  }
  // Reject far-past requests (more than 30 days ago) to limit retroactive abuse.
  const today = new Date();
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - 30);
  if (new Date(start_date) < earliest) {
    return NextResponse.json({ error: 'Start date is too far in the past.' }, { status: 400 });
  }

  const sb = adminClient();
  const { data: emp, error: empErr } = await sb
    .from('employee_records')
    .select('id, full_name, email, company_id, status')
    .eq('leave_token', token)
    .maybeSingle();

  if (empErr || !emp) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }
  if (emp.status === 'terminated') {
    return NextResponse.json({ error: 'This link is no longer active' }, { status: 410 });
  }

  // Inclusive day count.
  const days =
    Math.floor((new Date(end_date).getTime() - new Date(start_date).getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // Reason is captured into the `notes` column of absence_records so it
  // shows up alongside the standard fields when the Admin/Editor reviews.
  const { error: insErr } = await sb
    .from('absence_records')
    .insert({
      company_id:     emp.company_id,
      employee_id:    emp.id,
      employee_name:  emp.full_name,
      employee_email: emp.email,
      absence_type,
      start_date,
      end_date,
      days,
      status:         'pending',
      notes:          reason,
    });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Rotate the leave_token after every successful submission. The link
  // the employee just used is now dead — a leaked URL on a forwarded
  // text or screenshot can't be replayed to spam more pending requests.
  // The admin/portal regen-token route is still available for issuing
  // a fresh link to the same employee. We rotate post-insert so a DB
  // failure doesn't double-burn the token.
  try {
    const fresh = randomBytes(16).toString('hex');
    await sb.from('employee_records')
      .update({ leave_token: fresh })
      .eq('id', emp.id);
  } catch (e) {
    // Non-fatal: the request was already saved. Log and move on.
    console.error('[leave] post-submit token rotate failed:', (e as Error).message);
  }

  return NextResponse.json({ success: true });
}
