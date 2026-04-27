import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: { id: string } }

export async function POST(_request: NextRequest, { params }: Ctx) {
  const { user, role, companyId } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  // Both Admin and Editor can approve leave per the role spec.
  if (role !== 'client_admin' && role !== 'client_editor') {
    return NextResponse.json({ error: 'You don\'t have permission to approve leave.' }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid leave-request id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('absence_records')
    .update({
      status:      'approved',
      approved_by: user.email ?? user.id,
    })
    .eq('id', params.id)
    .eq('company_id', companyId)  // belt-and-braces on top of RLS
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Leave request not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
