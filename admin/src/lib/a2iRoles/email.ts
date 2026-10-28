// The Athletes To Industry Thursday "live roles" email.
//
// Athletes To Industry navy/gold shell (wrapEmailA2I), sent from Tom's
// own andrews-recruitment.com mailbox over SMTP. One card per role:
// the title links to the role's page on andrews-recruitment.com, and a
// gold "Match me" button opens a no-login confirm page.
//
// Every string that came from Manatal is escaped. The client's name is
// never rendered (see format.ts). Built with tables and inline styles
// because Outlook ignores most CSS.

import { wrapEmailA2I, A2I } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/email/templates/notification';
import { portalUrl } from '@/lib/portalUrl';
import { roleUrl, type LiveRole } from './format';

export interface RoleAlertEmailInput {
  firstName:       string | null;
  roles:           LiveRole[];
  /** The raw link token for this recipient, or null for a preview/test
   *  (whose Match me and unsubscribe links go to a harmless preview page). */
  token:           string | null;
  roleUrlTemplate: string;
}

export interface RoleAlertEmail {
  subject:        string;
  html:           string;
  unsubscribeUrl: string;
}

export function matchUrl(token: string | null, jobId: string): string {
  return token
    ? `${portalUrl()}/r/roles/${token}/match/${encodeURIComponent(jobId)}`
    : `${portalUrl()}/r/roles/preview`;
}

export function unsubscribeUrl(token: string | null): string {
  return token ? `${portalUrl()}/r/roles/${token}/unsubscribe` : `${portalUrl()}/r/roles/preview`;
}

export function roleAlertSubject(count: number): string {
  return count === 1 ? 'This week’s live role | Athletes To Industry' : `${count} live roles this week | Athletes To Industry`;
}

// nowrap: Outlook for Android squeezed both buttons until "Match me"
// and "View role" broke onto two lines each (test send, 2026-10-28).
function button(href: string, label: string, solid: boolean): string {
  const bg = solid ? A2I.gold : 'transparent';
  const fg = solid ? A2I.navyDeep : A2I.cream;
  const border = solid ? A2I.gold : 'rgba(243,236,216,0.35)';
  return `<td style="padding:0 8px 0 0;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td nowrap style="border-radius:8px;background:${bg};border:1px solid ${border};white-space:nowrap;">
      <a href="${href}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:${fg};text-decoration:none;border-radius:8px;white-space:nowrap;">${label}</a>
    </td>
  </tr></table>
</td>`;
}

function roleCard(role: LiveRole, input: RoleAlertEmailInput): string {
  const view = escapeHtml(roleUrl(input.roleUrlTemplate, role.id));
  const match = escapeHtml(matchUrl(input.token, role.id));
  const meta = [role.location, role.contract, role.salary].filter(Boolean).map(s => escapeHtml(s!)).join(' &middot; ');
  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;border:1px solid ${A2I.border};border-radius:12px;background:${A2I.navyDeep};">
  <tr>
    <td style="padding:20px 22px;">
      ${role.industry ? `<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${A2I.gold};">${escapeHtml(role.industry)}</p>` : ''}
      <p style="margin:0 0 6px 0;font-size:18px;line-height:1.3;font-weight:700;">
        <a href="${view}" style="color:${A2I.cream};text-decoration:none;">${escapeHtml(role.title)}</a>
      </p>
      ${meta ? `<p style="margin:0 0 12px 0;font-size:13px;color:${A2I.creamMut};">${meta}</p>` : ''}
      ${role.summary ? `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:${A2I.cream};">${escapeHtml(role.summary)}</p>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${button(match, 'Match me', true)}
        ${button(view, 'View role', false)}
      </tr></table>
    </td>
  </tr>
</table>`;
}

export function buildRoleAlertEmail(input: RoleAlertEmailInput): RoleAlertEmail {
  const n = input.roles.length;
  const greeting = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : 'Hi there,';
  const unsub = unsubscribeUrl(input.token);

  const body = `
<h1 style="margin:0 0 6px 0;font-size:24px;line-height:1.25;font-weight:700;color:${A2I.cream};">This week&rsquo;s live roles</h1>
<p style="margin:0 0 22px 0;font-size:13px;letter-spacing:0.04em;color:${A2I.gold};text-transform:uppercase;">${n} ${n === 1 ? 'opportunity' : 'opportunities'} from Andrews Recruitment Group</p>
<p style="margin:0 0 14px 0;">${greeting}</p>
<p style="margin:0 0 24px 0;">Here are the roles we&rsquo;re recruiting for right now. Tap <strong style="color:${A2I.gold};">View role</strong> to read the full details, or <strong style="color:${A2I.gold};">Match me</strong> on any that catch your eye and Tom will look at whether you&rsquo;re a fit.</p>
${input.roles.map(r => roleCard(r, input)).join('\n')}
<p style="margin:24px 0 0 0;font-size:13px;color:${A2I.creamMut};">Not quite right this week? New roles land every Thursday. If you have a question, just reply to this email.</p>
`.trim();

  const footer = `You&rsquo;re receiving this because you registered with Athletes To Industry. <a href="${escapeHtml(unsub)}" style="color:${A2I.gold};">Unsubscribe from these weekly role emails</a>.`;

  return {
    subject:        roleAlertSubject(n),
    html:           wrapEmailA2I(body, `${n} live ${n === 1 ? 'role' : 'roles'} this week. Tap Match me on any that fit.`, footer),
    unsubscribeUrl: unsub,
  };
}
