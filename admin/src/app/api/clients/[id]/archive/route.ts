import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const companyId = params.id;
  if (!UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Invalid company id' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company, error } = await adminClient
    .from('companies')
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq('id', companyId)
    .select('id, name')
    .maybeSingle();

  if (error || !company) {
    return NextResponse.json({ error: error?.message ?? 'Company not found' }, { status: 404 });
  }

  auditLog({
    action:      'company.archived',
    actor_id:    auth.userId,
    target_id:   companyId,
    target_type: 'company',
    metadata:    { name: (company as any).name },
  });

  revalidateTag(`client:${companyId}`);
  revalidatePath('/clients');
  revalidatePath(`/clients/${companyId}`);

  return NextResponse.json({ success: true });
}
