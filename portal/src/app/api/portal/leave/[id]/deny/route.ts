import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: { id: string } }

export async function POST(request: NextRequest, { params }: Ctx) {
  const { user, role, companyId } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (role !== 'client_admin' && role !== 'client_editor') {
    return NextResponse.json({ error: 'You don\'t have permission to decline leave.' }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid leave-request id' }, { status: 400 });
  }

  let body: { note?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const note = (body.note ?? '').trim();
  if (!note) {
    return NextResponse.json({ error: 'A reason is required when declining leave.' }, { status: 400 });
  }
  if (note.length > 1000) {
    return NextResponse.json({ error: 'Reason is too long (max 1000 characters).' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Fetch the absence row first so we know which employee to attach
  // the note to. Belt-and-braces company scope check on top of RLS.
  const { data: absence, error: fetchErr } = await supabase
    .from('absence_records')
    .select('id, employee_id, employee_name, company_id')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (fetchErr || !absence) {
    return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  }

  // Two writes in parallel: update the absence_records status, and
  // append a denial note to the employee's notes log.
  const [{ error: upErr }, { error: noteErr }] = await Promise.all([
    supabase
      .from('absence_records')
      .update({ status: 'rejected', approved_by: user.email ?? user.id })
      .eq('id', params.id)
      .eq('company_id', companyId),
    absence.employee_id
      ? supabase
          .from('employee_notes')
          .insert({
            employee_id: absence.employee_id,
            company_id:  absence.company_id,
            author_id:   user.id,
            note_type:   'leave_denied',
            body:        note,
            related_id:  absence.id,
          })
      : Promise.resolve({ error: null }),  // no employee_id (legacy row); skip note write
  ]);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
