import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/automation/runs';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid } from '@/lib/validation/primitives';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { COUNT_EXACT } from '@/lib/supabase/mutations';
import { createSmtpSession } from '@/lib/email/smtp';
import { loadSender } from '@/lib/a2iRoles/sender';
import { loadConfig, requeueFailed, runRoleAlert } from '@/lib/a2iRoles/send';
import { loadLiveRoles } from '@/lib/a2iRoles/live';
import { buildRoleAlertEmail } from '@/lib/a2iRoles/email';
import { firstName } from '@/lib/a2iRoles/recipients';
import { auditLog } from '@/lib/audit';

// Staff actions for the Athletes To Industry Thursday role email
// (/athletes-to-industry/roles-email). One validated route, one action
// per request.
//
// Config, the selected-athletes list and opt-outs are written with the
// caller's own session (staff RLS, 217), so the audit trail names them.
// Sending uses the service role: the link-token table is service-role
// only by design.
//
// "Send test to me" goes to the signed-in staff member's OWN address,
// taken from their profile — never an address from the request body.
// Nothing in this route can email anyone who is not an athlete or the
// person pressing the button.

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const Schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_config'),
    enabled:           z.boolean().optional(),
    recipient_mode:    z.enum(['all', 'selected']).optional(),
    sender_profile_id: uuid.nullable().optional(),
    role_url_template: z.string().trim().max(300)
      .regex(/^https:\/\/\S+$/, 'Must be an https link')
      .refine(v => v.includes('{id}'), 'Must contain {id} where the Manatal job id goes')
      .optional(),
    notify_email: z.string().trim().max(254).email('Must be a valid email address').optional(),
  }),
  z.object({ action: z.literal('set_recipient'), athlete_id: uuid, selected: z.boolean() }),
  z.object({ action: z.literal('set_optout'), athlete_id: uuid, opted_out: z.boolean() }),
  z.object({ action: z.literal('verify_smtp') }),
  z.object({ action: z.literal('test') }),
  z.object({ action: z.literal('send_now'), confirm: z.literal(true) }),
  z.object({ action: z.literal('retry_failed'), confirm: z.literal(true) }),
]);

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const supabase = await createServerSupabaseClient();

  switch (body.action) {
    case 'save_config': {
      const rl = limiters.write.check(getUserRateLimitKey(req, auth.userId));
      if (!rl.allowed) return rateLimitResponse(rl.resetAt);
      const { action: _a, ...patch } = body;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
      if (patch.sender_profile_id) {
        const sender = await loadSender(serviceClient(), patch.sender_profile_id);
        if (!sender.ok) return NextResponse.json({ error: sender.error }, { status: 400 });
      }
      const { data, error } = await supabase.from('a2i_role_alert_config')
        .update({ ...patch, updated_by: auth.userId })
        .eq('singleton', true)
        .select('id, enabled, recipient_mode, sender_profile_id, role_url_template, notify_email')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, config: data });
    }

    case 'set_recipient': {
      if (body.selected) {
        const { error } = await supabase.from('a2i_role_alert_recipients')
          .upsert({ athlete_id: body.athlete_id, added_by: auth.userId }, { onConflict: 'athlete_id', ignoreDuplicates: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { error } = await supabase.from('a2i_role_alert_recipients').delete(COUNT_EXACT).eq('athlete_id', body.athlete_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    case 'set_optout': {
      const { data: athlete } = await supabase.from('athletes').select('id, email').eq('id', body.athlete_id).maybeSingle();
      const email = athlete?.email?.trim().toLowerCase();
      if (!email) return NextResponse.json({ error: 'That athlete has no email address' }, { status: 400 });
      if (body.opted_out) {
        const { error } = await supabase.from('a2i_role_alert_optouts')
          .upsert({ email_lower: email, athlete_id: body.athlete_id, source: 'staff', created_by: auth.userId },
            { onConflict: 'email_lower', ignoreDuplicates: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { error } = await supabase.from('a2i_role_alert_optouts').delete(COUNT_EXACT).eq('email_lower', email);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    case 'verify_smtp': {
      const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
      if (!rl.allowed) return rateLimitResponse(rl.resetAt);
      const sb = serviceClient();
      const config = await loadConfig(sb);
      const sender = await loadSender(sb, config?.sender_profile_id ?? null);
      if (!sender.ok) return NextResponse.json({ ok: false, error: sender.error });
      const session = createSmtpSession(sender.creds);
      try {
        const v = await session.verify();
        if (!v.ok) return NextResponse.json({ ok: false, error: v.error, from: sender.fromEmail });
        await sb.from('profiles').update({ smtp_last_verified_at: new Date().toISOString() }, COUNT_EXACT).eq('id', sender.profileId);
        return NextResponse.json({ ok: true, from: sender.fromEmail });
      } finally {
        session.close();
      }
    }

    case 'test': {
      const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
      if (!rl.allowed) return rateLimitResponse(rl.resetAt);
      const sb = serviceClient();
      const [config, { data: me }] = await Promise.all([
        loadConfig(sb),
        sb.from('profiles').select('email, full_name').eq('id', auth.userId).maybeSingle(),
      ]);
      if (!config) return NextResponse.json({ error: 'Role email config is missing' }, { status: 500 });
      if (!me?.email) return NextResponse.json({ error: 'Your profile has no email address' }, { status: 400 });
      const live = await loadLiveRoles(sb, new Date());
      if (live.error) return NextResponse.json({ error: `Manatal: ${live.error}` }, { status: 502 });
      if (live.roles.length === 0) return NextResponse.json({ error: 'There are no live roles in Manatal to show' }, { status: 400 });
      const sender = await loadSender(sb, config.sender_profile_id);
      if (!sender.ok) return NextResponse.json({ error: sender.error }, { status: 400 });
      const email = buildRoleAlertEmail({
        firstName: firstName(me.full_name), roles: live.roles, token: null, roleUrlTemplate: config.role_url_template,
      });
      const session = createSmtpSession(sender.creds);
      try {
        const res = await session.send({ to: me.email, subject: `[Test] ${email.subject}`, html: email.html });
        if (!res.ok) return NextResponse.json({ error: `SMTP: ${res.error}` }, { status: 502 });
      } finally {
        session.close();
      }
      return NextResponse.json({ ok: true, to: me.email, roles: live.roles.length });
    }

    case 'send_now':
    case 'retry_failed': {
      const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
      if (!rl.allowed) return rateLimitResponse(rl.resetAt);
      const sb = serviceClient();
      const now = new Date();
      if (body.action === 'retry_failed') {
        const rq = await requeueFailed(sb, now);
        if (rq.error) return NextResponse.json({ error: rq.error }, { status: 400 });
        if (rq.requeued === 0) return NextResponse.json({ error: 'There are no failed sends this week to retry' }, { status: 400 });
      }
      const result = await runRoleAlert(sb, { now, trigger: 'manual', triggeredBy: auth.userId });
      auditLog({
        action: body.action === 'send_now' ? 'athlete_roles_email.sent_manually' : 'athlete_roles_email.retried',
        target_type: 'a2i_role_alert_sends', target_id: result.tally.week_key, actor_id: auth.userId,
        metadata: { sent: result.tally.sent_this_run, failed: result.tally.failed_this_run, status: result.tally.status ?? result.tally.skipped },
      });
      if (result.tally.skipped === 'already_sent') {
        return NextResponse.json({ error: 'This week’s email has already gone out. Use Retry failed for anyone it missed.' }, { status: 409 });
      }
      return NextResponse.json({ ok: !result.error, tally: result.tally, error: result.error ?? null }, { status: result.error ? 502 : 200 });
    }
  }
}
