import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConvertBody {
  sector?:        string | null;
  size_band?:     string | null;
  contact_email?: string | null;
  contact_name?:  string | null;
}

/**
 * Convert a BD prospect to a client.
 *
 * Replaces the previous browser-side multi-step flow that ran 5
 * separate Supabase writes from the modal. If any one of those failed
 * partway, the operator was left with a half-converted client (company
 * exists, no compliance seed, no welcome action, no invite). This
 * route serializes the steps server-side, rolls back the inserted
 * company on any failure, and returns one consolidated status.
 *
 * Roll-back strategy: Postgres can't atomically span 5 inserts via
 * Supabase's REST API, so we manually delete the company row on
 * failure. Cascades take care of any partially-inserted dependent
 * rows. Stripe is NOT touched here — billing setup is a separate
 * follow-on action.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const bdId = params.id;
  // BD ids may be either UUIDs (DB rows) or 'ivylens-<uid>' synthetic
  // identifiers; both are accepted.
  const isIvylens = bdId.startsWith('ivylens-');
  if (!isIvylens && !UUID_RE.test(bdId)) {
    return NextResponse.json({ error: 'Invalid BD company id' }, { status: 400 });
  }

  let body: ConvertBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── 0. Resolve company name from BD row (if it's a real DB row). ──
  let companyName: string | null = null;
  if (!isIvylens) {
    const { data: bd } = await sb
      .from('bd_companies')
      .select('company_name, status')
      .eq('id', bdId)
      .maybeSingle();
    if (!bd) return NextResponse.json({ error: 'BD company not found' }, { status: 404 });
    if (bd.status === 'Client') {
      return NextResponse.json({ error: 'Already converted to client' }, { status: 409 });
    }
    companyName = bd.company_name;
  } else {
    // For synthetic IvyLens rows the caller passes the name in the body.
    companyName = (body as any).company_name ?? null;
    if (!companyName) {
      return NextResponse.json({ error: 'company_name required for IvyLens conversions' }, { status: 400 });
    }
  }

  // ── 1. Insert companies row. ──
  const { data: newClient, error: insertErr } = await sb
    .from('companies')
    .insert({
      name:          companyName,
      sector:        body.sector    || null,
      size_band:     body.size_band || null,
      feature_flags: { hiring: true, documents: true, reports: true, support: true, metrics: true, compliance: true },
    })
    .select('id')
    .single();
  if (insertErr || !newClient) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create client record' }, { status: 500 });
  }
  const newClientId: string = newClient.id;

  // Helper that rolls back the company row on any later failure. Cascades
  // clean up everything inserted under it so we leave no orphans.
  async function rollback(reason: string, status = 500) {
    await sb.from('companies').delete().eq('id', newClientId);
    return NextResponse.json({ error: reason, rolled_back: true }, { status });
  }

  // ── 2. Mark the BD row as Client (if real). ──
  if (!isIvylens) {
    const { error } = await sb.from('bd_companies').update({ status: 'Client' }).eq('id', bdId);
    if (error) return rollback(`BD status update failed: ${error.message}`);
  }

  // ── 3. Seed compliance items + welcome action (parallel). ──
  const today = new Date();
  const due = (days: number) => new Date(today.getTime() + days * 86400_000).toISOString().split('T')[0];

  const [{ error: compErr }, { error: actErr }] = await Promise.all([
    sb.from('compliance_items').insert([
      { company_id: newClientId, title: 'Employment contract audit', category: 'hr',            status: 'pending', due_date: due(30) },
      { company_id: newClientId, title: 'GDPR data audit',           category: 'legal',         status: 'pending', due_date: due(60) },
      { company_id: newClientId, title: 'Health & Safety review',    category: 'health_safety', status: 'pending', due_date: due(90) },
      { company_id: newClientId, title: 'Data protection policy review', category: 'legal',     status: 'pending', due_date: due(90) },
    ]),
    sb.from('actions').insert({
      company_id:       newClientId,
      action_type:      'general',
      title:            'Welcome to The People System portal',
      description:      'Your HR portal is now active. Start by completing the initial compliance checklist and adding your team members.',
      priority:         'normal',
      status:           'active',
      created_by_admin: true,
    }),
  ]);

  if (compErr) return rollback(`Compliance seed failed: ${compErr.message}`);
  if (actErr)  return rollback(`Welcome action seed failed: ${actErr.message}`);

  // ── 4. Seed contact employee + invite (parallel). ──
  // Employee insert is non-fatal (operator can add manually); invite is
  // also non-fatal (operator gets a warning but the company stays).
  const warnings: string[] = [];
  const seedEmployee = body.contact_name?.trim()
    ? sb.from('employee_records').insert({
        company_id:      newClientId,
        full_name:       body.contact_name.trim(),
        email:           body.contact_email?.trim() || null,
        job_title:       'Founder',
        department:      'Leadership',
        employment_type: 'full_time',
        status:          'active',
        start_date:      today.toISOString().split('T')[0],
        line_manager:    null,
      })
    : Promise.resolve({ error: null as any });

  const inviteFlow = body.contact_email?.trim()
    ? (async () => {
        // Forward to /api/invite with the same auth cookie so its
        // requireStaff() passes. We re-use the route rather than
        // duplicating the user-create + token + email logic here.
        const res = await fetch(`${req.nextUrl.origin}/api/invite`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
          body:    JSON.stringify({
            email:      body.contact_email,
            company_id: newClientId,
            full_name:  body.contact_name || undefined,
            role:       'client_admin',
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { warning: `Invite failed: ${json.error ?? res.statusText}`, json };
        if (json.email_sent === false) {
          return { warning: `Invite link generated but email did not send: ${json.email_warning ?? ''} Activation: ${json.activate_url ?? '(see profile)'}`, json };
        }
        return { warning: null, json };
      })()
    : Promise.resolve({ warning: null, json: null });

  const [empResult, invResult] = await Promise.allSettled([seedEmployee, inviteFlow]);

  if (empResult.status === 'rejected') {
    warnings.push(`Employee seed failed: ${String(empResult.reason)}`);
  } else if (empResult.status === 'fulfilled' && (empResult.value as any).error) {
    warnings.push(`Employee seed failed: ${(empResult.value as any).error.message}`);
  }
  if (invResult.status === 'rejected') {
    warnings.push(`Invite step failed: ${String(invResult.reason)}`);
  } else if (invResult.status === 'fulfilled' && invResult.value.warning) {
    warnings.push(invResult.value.warning);
  }

  auditLog({
    action:      'company.created',
    actor_id:    auth.userId,
    target_id:   newClientId,
    target_type: 'company',
    metadata:    { name: companyName, bd_id: bdId, warnings },
  });

  revalidatePath('/clients');
  revalidatePath('/bd-intelligence');

  return NextResponse.json({
    success:    true,
    client_id:  newClientId,
    warnings,
  });
}
