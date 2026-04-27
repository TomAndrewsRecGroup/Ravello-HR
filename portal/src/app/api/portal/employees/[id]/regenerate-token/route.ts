import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: { id: string } }

// Rotates the leave-request token for an employee. Used when the staff
// member loses their link or when a former employee shouldn't have
// access any more.
//
// Auth: Admin or Editor. Company scope verified server-side.
//
// Token generation runs in the DB via gen_random_bytes — same as the
// migration default so format stays consistent.

export async function POST(_request: NextRequest, { params }: Ctx) {
  const { user, role, companyId } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (role !== 'client_admin' && role !== 'client_editor') {
    return NextResponse.json({ error: 'You don\'t have permission to regenerate leave links.' }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
  }

  // Use service role so we can write to leave_token in one round-trip
  // regardless of RLS UPDATE policy on employee_records (Editor's
  // permissions there are looser than on protected tables anyway).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Server is missing required configuration.' }, { status: 500 });
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Generate a 32-char hex token in Node — same shape as the
  // `encode(gen_random_bytes(16), 'hex')` default the migration uses
  // for new rows. Using node:crypto keeps it built-in (no extra deps)
  // and avoids a round-trip just to fetch a token.
  const { randomBytes } = await import('crypto');
  const newToken = randomBytes(16).toString('hex');

  const { error: upErr } = await sb
    .from('employee_records')
    .update({ leave_token: newToken })
    .eq('id', params.id)
    .eq('company_id', companyId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, leave_token: newToken });
}
