import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { serviceClient } from '@/lib/automation/runs';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { loadConfig, loadRecipients } from '@/lib/a2iRoles/send';
import { loadLiveRoles } from '@/lib/a2iRoles/live';
import { buildRoleAlertEmail } from '@/lib/a2iRoles/email';
import { roleUrl } from '@/lib/a2iRoles/format';
import { firstName } from '@/lib/a2iRoles/recipients';

// What Thursday's email would contain if it went out now: the live
// Manatal roles (with each one's andrews-recruitment.com link, so staff
// can click-check them) and the rendered email, with preview links in
// place of real Match me tokens. Reads only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const rl = limiters.vendor.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const sb = serviceClient();
  const [config, { data: me }] = await Promise.all([
    loadConfig(sb),
    sb.from('profiles').select('full_name').eq('id', auth.userId).maybeSingle(),
  ]);
  if (!config) return NextResponse.json({ error: 'Role email config is missing' }, { status: 500 });

  const [live, rec] = await Promise.all([loadLiveRoles(sb, new Date()), loadRecipients(sb, config)]);
  if (live.error) return NextResponse.json({ error: `Manatal: ${live.error}` }, { status: 502 });

  const email = buildRoleAlertEmail({
    firstName: firstName(me?.full_name), roles: live.roles, token: null, roleUrlTemplate: config.role_url_template,
  });
  return NextResponse.json({
    subject:    email.subject,
    html:       email.html,
    recipients: rec.error ? null : rec.recipients.length,
    roles:      live.roles.map(r => ({ ...r, url: roleUrl(config.role_url_template, r.id) })),
  });
}
