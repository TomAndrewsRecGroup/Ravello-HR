import { wrapEmail, ctaButton, BRAND } from '../layout';

// The two Monday emails for Health & Safety, filled from the register:
//
//   providerWeeklyDigestEmail — to each provider login, one section per
//   client they are assigned to: overdue, due within 30 days, and the
//   client's open failed-check actions.
//   clientWeeklySummaryEmail  — to a client's admins, when their
//   weekly_summary preference is on: the same register, from their side,
//   plus what their providers logged this week.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface WeeklyItem {
  title:     string;
  due_date:  string | null;
  /** From Jev's ranking or the deterministic fallback. */
  attention: 'routine' | 'soon' | 'priority' | 'critical';
  overdue:   boolean;
}
export interface WeeklyAction { title: string; priority: string; created_at: string }
export interface WeeklyActivity { title: string; type_label: string; occurred_on: string; provider: string }

export interface WeeklyCompanySection {
  companyName:  string;
  overdue:      WeeklyItem[];
  dueSoon:      WeeklyItem[];
  openActions:  WeeklyAction[];
  /** Top items in attention order (≤3). */
  topAttention: WeeklyItem[];
}

const ATTENTION_COLOUR: Record<WeeklyItem['attention'], string> = {
  critical: '#B42318', priority: '#B54708', soon: BRAND.purple, routine: BRAND.inkFaint,
};

function itemRows(items: WeeklyItem[]): string {
  if (items.length === 0) return `<p style="margin:4px 0 12px 0;font-size:13px;color:${BRAND.inkFaint};">None.</p>`;
  return `<ul style="margin:4px 0 12px 0;padding-left:18px;font-size:14px;color:${BRAND.ink};">${items.map(i =>
    `<li style="margin:0 0 4px 0;">${esc(i.title)}${i.due_date ? ` <span style="color:${BRAND.inkFaint};">· due ${esc(i.due_date)}</span>` : ''}</li>`).join('')}</ul>`;
}

function section(s: WeeklyCompanySection, heading: string, showTop: boolean): string {
  return `
<h2 style="margin:24px 0 8px 0;font-size:16px;font-weight:700;color:${BRAND.ink};">${esc(heading)}</h2>
${showTop && s.topAttention.length ? `
<p style="margin:0 0 4px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Needs attention first</p>
<ol style="margin:4px 0 12px 0;padding-left:18px;font-size:14px;color:${BRAND.ink};">${s.topAttention.map(i =>
    `<li style="margin:0 0 4px 0;"><span style="color:${ATTENTION_COLOUR[i.attention]};font-weight:600;">${i.attention}</span> · ${esc(i.title)}${i.due_date ? ` <span style="color:${BRAND.inkFaint};">· ${i.overdue ? 'overdue since' : 'due'} ${esc(i.due_date)}</span>` : ''}</li>`).join('')}</ol>` : ''}
<p style="margin:0 0 4px 0;font-size:12px;color:#B42318;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Overdue (${s.overdue.length})</p>
${itemRows(s.overdue)}
<p style="margin:0 0 4px 0;font-size:12px;color:#B54708;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Due within 30 days (${s.dueSoon.length})</p>
${itemRows(s.dueSoon)}
<p style="margin:0 0 4px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Open actions from checks (${s.openActions.length})</p>
${s.openActions.length === 0 ? `<p style="margin:4px 0 12px 0;font-size:13px;color:${BRAND.inkFaint};">None.</p>`
    : `<ul style="margin:4px 0 12px 0;padding-left:18px;font-size:14px;color:${BRAND.ink};">${s.openActions.map(a => `<li style="margin:0 0 4px 0;">${esc(a.title)} <span style="color:${BRAND.inkFaint};">· ${esc(a.priority)}</span></li>`).join('')}</ul>`}
`;
}

export function providerWeeklyDigestEmail(input: { providerName: string; weekLabel: string; sections: WeeklyCompanySection[]; workspaceUrl: string }) {
  const totals = input.sections.reduce((t, s) => ({ overdue: t.overdue + s.overdue.length, soon: t.soon + s.dueSoon.length, actions: t.actions + s.openActions.length }), { overdue: 0, soon: 0, actions: 0 });
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Health &amp; Safety · week of ${esc(input.weekLabel)}</p>
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your clients this week</h1>
<p style="margin:0 0 4px 0;font-size:14px;color:${BRAND.inkSoft};">${totals.overdue} overdue · ${totals.soon} due within 30 days · ${totals.actions} open action${totals.actions === 1 ? '' : 's'} across ${input.sections.length} client${input.sections.length === 1 ? '' : 's'}.</p>
${input.sections.map(s => section(s, s.companyName, true)).join('')}
${ctaButton(input.workspaceUrl, 'Open the H&S workspace')}
`.trim();
  return {
    subject: `H&S this week: ${totals.overdue} overdue, ${totals.soon} due soon`,
    html: wrapEmail(body, `${totals.overdue} overdue and ${totals.soon} due within 30 days across your clients.`),
    tag: 'hs-provider-weekly',
  };
}

export function clientWeeklySummaryEmail(input: { section: WeeklyCompanySection; weekLabel: string; activities: WeeklyActivity[]; registerUrl: string }) {
  const s = input.section;
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Health &amp; Safety · week of ${esc(input.weekLabel)}</p>
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your safety summary</h1>
<p style="margin:0 0 4px 0;font-size:14px;color:${BRAND.inkSoft};">${s.overdue.length} overdue · ${s.dueSoon.length} due within 30 days · ${s.openActions.length} open action${s.openActions.length === 1 ? '' : 's'}. We and your providers are watching these for you.</p>
${section(s, 'Your register', true)}
<h2 style="margin:24px 0 8px 0;font-size:16px;font-weight:700;color:${BRAND.ink};">Logged this week</h2>
${input.activities.length === 0 ? `<p style="margin:4px 0 12px 0;font-size:13px;color:${BRAND.inkFaint};">Nothing new was logged.</p>`
    : `<ul style="margin:4px 0 12px 0;padding-left:18px;font-size:14px;color:${BRAND.ink};">${input.activities.map(a => `<li style="margin:0 0 4px 0;">${esc(a.provider)} · ${esc(a.type_label)} · ${esc(a.occurred_on)}: ${esc(a.title)}</li>`).join('')}</ul>`}
${ctaButton(input.registerUrl, 'Open your register')}
`.trim();
  return {
    subject: `Your H&S summary: ${s.overdue.length} overdue, ${s.dueSoon.length} due soon`,
    html: wrapEmail(body, `${s.overdue.length} overdue, ${s.dueSoon.length} due within 30 days, ${s.openActions.length} open actions.`),
    tag: 'hs-client-weekly',
  };
}
