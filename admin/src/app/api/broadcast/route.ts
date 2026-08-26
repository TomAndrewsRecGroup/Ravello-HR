import { portalUrl as portalUrlFromEnv } from '@/lib/portalUrl';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { longText, optionalIsoDate, optionalShortText, shortText, uuid, z } from '@/lib/validation/primitives';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { sendEmail, actionAssignedEmail } from '@/lib/email';
import { assertBodySize } from '@/lib/http/bodySize';

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


// This writes one action per company, so an unbounded company_ids array
// is an unbounded write amplification from a single request.
const BroadcastSchema = z.object({
  company_ids: z.array(uuid).min(1, 'Select at least one client').max(500),
  title:       shortText(200),
  description: longText(5_000).optional().nullable().transform(v => v || null),
  action_type: optionalShortText(60),
  priority:    z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  due_date:    optionalIsoDate,
});

export async function POST(req: NextRequest) {
  const tooBig = assertBodySize(req, 256 * 1024);
  if (tooBig) return tooBig;

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action. Keyed by user rather
  // than IP so one person's bulk run does not throttle the office.
  const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);
  const supabase = createServerSupabaseClient();

  const parsed = await parseBody(req, BroadcastSchema);
  if (!parsed.ok) return parsed.response;
  const { company_ids, title, description, action_type, priority, due_date } = parsed.data;

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
  const portalUrl = portalUrlFromEnv();
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
        actionsUrl:    `${portalUrl}/protect/actions`,
      })))
    );
  }

  // Bust the dashboard cache so the new actions are reflected in the
  // admin's "Active actions" rollups immediately.
  revalidatePath('/dashboard');
  for (const id of company_ids as string[]) {
    revalidatePath(`/clients/${id}`);
  }

  return NextResponse.json({ created: data?.length ?? 0 });
}
