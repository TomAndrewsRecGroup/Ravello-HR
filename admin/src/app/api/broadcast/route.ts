import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { sendEmail, actionAssignedEmail } from '@/lib/email';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
};

function formatDueDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// POST /api/broadcast
// Creates an action item for each selected company.
// Body: { company_ids: string[], title: string, description?: string,
//         action_type: string, priority: string, due_date?: string }

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabaseClient();

  const body = await req.json();
  const { company_ids, title, description, action_type, priority, due_date } = body;

  if (!company_ids?.length || !title || !action_type || !priority) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ── Validate company_ids are UUIDs and exist ──
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(company_ids) || company_ids.some((id: string) => !UUID_RE.test(id))) {
    return NextResponse.json({ error: 'Invalid company_id format' }, { status: 400 });
  }

  if (due_date && isNaN(Date.parse(due_date))) {
    return NextResponse.json({ error: 'Invalid due_date format' }, { status: 400 });
  }

  const { data: validCompanies, error: lookupErr } = await supabase
    .from('companies').select('id').in('id', company_ids);
  if (lookupErr) {
    return NextResponse.json({ error: 'Failed to validate companies' }, { status: 500 });
  }
  const validIds = new Set((validCompanies ?? []).map(c => c.id));
  const invalidIds = company_ids.filter((id: string) => !validIds.has(id));
  if (invalidIds.length > 0) {
    return NextResponse.json({ error: `Companies not found: ${invalidIds.join(', ')}` }, { status: 400 });
  }

  const rows = (company_ids as string[]).map((company_id: string) => ({
    company_id,
    title,
    description:         description || null,
    action_type,
    priority,
    due_date:            due_date || null,
    status:              'active',
    created_by_admin:    true,
  }));

  const { data, error } = await supabase.from('actions').insert(rows).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  auditLog({
    action: 'broadcast.sent',
    actor_id: auth.userId,
    metadata: { title, action_type, company_count: company_ids.length, created: data?.length ?? 0 },
  });

  // Notify each company's client_admin users by email. We email Admins
  // only (not Editors) so the inbox-flood for a 50-company broadcast
  // stays manageable — the Action shows on the actions page for everyone.
  // sendEmail is fire-and-forget; failures don't block the API response.
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const { data: recipients } = await supabase
    .from('profiles')
    .select('email, company_id, companies(name)')
    .in('company_id', company_ids as string[])
    .eq('role', 'client_admin');

  if (recipients?.length) {
    // Group emails by company so the per-email subject line names the
    // right company. One Promise.all so they fire in parallel.
    await Promise.all(recipients
      .filter((r: any) => r.email)
      .map((r: any) => sendEmail(actionAssignedEmail({
        to:            r.email,
        companyName:   r.companies?.name ?? 'your company',
        title,
        description:   description ?? undefined,
        priorityLabel: PRIORITY_LABELS[priority] ?? priority,
        dueDate:       formatDueDate(due_date),
        actionsUrl:    `${portalUrl}/actions`,
      })))
    );
  }

  return NextResponse.json({ created: data?.length ?? 0 });
}
