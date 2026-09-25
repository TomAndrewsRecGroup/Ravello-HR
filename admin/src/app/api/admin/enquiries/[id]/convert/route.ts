import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText, uuid, z } from '@/lib/validation/primitives';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { normaliseCompanyName } from '@/lib/bd/prospectScore';
import { createKeyedInternalTask } from '@/lib/events/supportRules';

// POST /api/admin/enquiries/[id]/convert
//
// An enquiry becomes (or joins) a BD prospect: matched on the
// normalised company name so "Acme Ltd" and "ACME Limited" are one
// row, marked contacted, linked back from the enquiry, and a
// follow-up task lands on the caller's board in two days — once per
// enquiry (source_ref). Own session: RLS on bd_companies, enquiries and
// internal_tasks is staff-only.

export const runtime = 'nodejs';

const Body = z.object({ company_name: optionalShortText(200) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const rl = limiters.account.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);
  if (!uuid.safeParse(params.id).success) return NextResponse.json({ error: 'Invalid enquiry id' }, { status: 400 });
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const sb = createServerSupabaseClient();
  const { data: enq } = await sb.from('enquiries').select('id, full_name, email, company_name, source, status, bd_company_id').eq('id', params.id).maybeSingle();
  const e = enq as { id: string; full_name: string; email: string; company_name: string | null; source: string; status: string; bd_company_id: string | null } | null;
  if (!e) return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });

  const name = (parsed.data.company_name ?? e.company_name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'This enquiry has no company name. Type one to convert it.' }, { status: 400 });
  const normalised = normaliseCompanyName(name);
  if (!normalised) return NextResponse.json({ error: 'That company name is empty once normalised.' }, { status: 400 });

  let bdId = e.bd_company_id;
  let created = false;
  if (!bdId) {
    const { data: existing } = await sb.from('bd_companies').select('id, status').eq('company_name_normalised', normalised).maybeSingle();
    const ex = existing as { id: string; status: string } | null;
    if (ex) {
      bdId = ex.id;
      if (ex.status.toLowerCase() === 'prospect') {
        const res = await sb.from('bd_companies').update({ status: 'contacted' }, COUNT_EXACT).eq('id', ex.id);
        const w = judgeWrite({ error: res.error, count: res.count }); if (!w.ok) return NextResponse.json({ error: w.message }, { status: 500 });
      }
    } else {
      const { data: ins, error } = await sb.from('bd_companies').insert({
        company_name: name, company_name_normalised: normalised, status: 'contacted', source: 'enquiry', total_roles_seen: 0,
        notes: `From ${e.source.replace(/_/g, ' ')} enquiry by ${e.full_name} <${e.email}>`,
      }).select('id').single();
      if (error || !ins) return NextResponse.json({ error: error?.message ?? 'Could not create the prospect' }, { status: 500 });
      bdId = (ins as { id: string }).id; created = true;
    }
    const res = await sb.from('enquiries').update({ bd_company_id: bdId, status: e.status === 'new' ? 'contacted' : e.status }, COUNT_EXACT).eq('id', e.id);
    const w = judgeWrite({ error: res.error, count: res.count }); if (!w.ok) return NextResponse.json({ error: w.message }, { status: 500 });
  }

  let task = false;
  try {
    task = await createKeyedInternalTask(sb, {
      company_id: null, assigned_to: auth.userId, title: `Follow up ${name} (${e.full_name})`,
      description: `${e.source.replace(/_/g, ' ')} enquiry · ${e.email}`, priority: 'normal',
      due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), source_ref: `enquiry_followup:${e.id}`,
    });
  } catch (err) {
    return NextResponse.json({ ok: true, bd_company_id: bdId, created, task: false, warning: `Prospect saved, but the follow-up task failed: ${(err as Error).message}` });
  }
  return NextResponse.json({ ok: true, bd_company_id: bdId, created, task });
}
