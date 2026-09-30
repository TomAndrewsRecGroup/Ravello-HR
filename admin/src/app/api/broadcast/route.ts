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
  company_ids:   z.array(uuid).min(1, 'Select at least one client').max(500),
  title:         shortText(200),
  description:   longText(5_000).optional().nullable().transform(v => v || null),
  action_type:   optionalShortText(60),
  priority:      z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  due_date:      optionalIsoDate,
  // Core-OS 360 Completion Programme, Phase 25, Group 1 (C1.11): a
  // caller-generated idempotency key, minted ONCE by the client when
  // the confirm modal opens (BroadcastClient.tsx) and resent unchanged
  // on every retry of the SAME send. Claimed via broadcast_sends'
  // UNIQUE id before any action/email work happens, so a double-click,
  // a timed-out-then-retried request, or a direct replay creates
  // nothing a second time.
  broadcast_key: uuid,
  // Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7): the
  // regulatory origin this broadcast was raised from, when it was —
  // never invented for a hand-typed broadcast. Recorded on
  // broadcast_sends (194) and propagated onto every action it raises
  // (source_type 'regulatory_broadcast'), so completion can be traced
  // back to the research that prompted it.
  source_type: z.enum(['legal_requirement', 'regulatory_update']).optional(),
  source_id:   uuid.optional(),
}).refine(d => (d.source_type == null) === (d.source_id == null), {
  message: 'source_type and source_id must be provided together', path: ['source_id'],
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
  const supabase = await createServerSupabaseClient();

  const parsed = await parseBody(req, BroadcastSchema);
  if (!parsed.ok) return parsed.response;
  const { company_ids, title, description, action_type, priority, due_date, broadcast_key, source_type, source_id } = parsed.data;

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

  // ── Claim the idempotency key BEFORE any write (Phase 25, Group 1,
  // C1.11). A conflict here means this exact send already happened —
  // the same discipline the visit-report issue route (Phase 7, Group 8)
  // and every keyed email in this codebase already follow: claim first,
  // do the work, revert the claim on failure so a genuine retry can
  // still proceed.
  const { error: claimErr } = await supabase.from('broadcast_sends').insert({
    id:              broadcast_key,
    created_by:      auth.userId,
    title,
    recipient_count: company_ids.length,
    source_type:     source_type ?? null,
    source_id:       source_id ?? null,
  });
  if (claimErr) {
    if (claimErr.code === '23505') {
      // Already sent under this exact key — report success with
      // nothing new created, never a second send.
      return NextResponse.json({ created: 0, duplicate: true });
    }
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  async function revertClaim() {
    await supabase.from('broadcast_sends').delete().eq('id', broadcast_key);
  }

  // A broadcast raised from a legal requirement or regulatory update
  // links every action back to THIS SEND (source_id = broadcast_key,
  // never the requirement/update id directly — the send is the
  // traceable unit; broadcast_sends.source_type/source_id is the next
  // hop back to the research). An ordinary hand-typed broadcast keeps
  // source_type null, unchanged from before this group.
  const rows = (company_ids as string[]).map((company_id: string) => ({
    company_id,
    title,
    description:         description || null,
    action_type,
    priority,
    due_date:            due_date || null,
    status:              'active',
    created_by_admin:    true,
    ...(source_type ? { source_type: 'regulatory_broadcast', source_id: broadcast_key } : {}),
  }));

  const { data, error } = await supabase.from('actions').insert(rows).select('id');
  if (error) {
    await revertClaim();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  auditLog({
    action: 'broadcast.sent',
    actor_id: auth.userId,
    // The exact recipient organisations, so the trail can prove who was
    // (and was not) sent this broadcast.
    metadata: { title, action_type, company_count: company_ids.length, company_ids, created: data?.length ?? 0 },
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
