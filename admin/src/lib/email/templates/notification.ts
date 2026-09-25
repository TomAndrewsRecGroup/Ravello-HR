import { wrapEmail, ctaButton, BRAND } from '../layout';
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/lib/notify/types';

// The generic notification email and the daily digest. Filled from
// data only — every string comes from a row the platform wrote or a
// title a rule composed; nothing here is generated.

export interface NotificationEmailInput {
  title: string;
  body:  string | null;
  href:  string | null;
  type:  NotificationType;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function notificationEmail(input: NotificationEmailInput) {
  const kind = NOTIFICATION_TYPE_LABELS[input.type] ?? 'Notification';
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">${escapeHtml(kind)}</p>
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">${escapeHtml(input.title)}</h1>
${input.body ? `<p style="margin:0 0 16px 0;font-size:15px;color:${BRAND.inkSoft};white-space:pre-wrap;">${escapeHtml(input.body)}</p>` : ''}
${input.href ? ctaButton(input.href, 'Open in Core OS 360') : ''}
`.trim();
  return {
    subject: input.title.slice(0, 150),
    html:    wrapEmail(body, input.body ? input.body.slice(0, 120) : input.title),
    tag:     'notification',
  };
}

export interface DigestItem {
  type:  NotificationType;
  title: string;
  body:  string | null;
  href:  string | null;
  at:    string;
}

export function notificationDigestEmail(input: { items: DigestItem[]; dateLabel: string; appHref: string }) {
  const groups = new Map<string, DigestItem[]>();
  for (const it of input.items) {
    const k = NOTIFICATION_TYPE_LABELS[it.type] ?? 'Other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const sections = [...groups.entries()].map(([label, items]) => `
<p style="margin:20px 0 6px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">${escapeHtml(label)} (${items.length})</p>
${items.map(it => `
<div style="padding:10px 12px;margin:0 0 6px 0;border:1px solid ${BRAND.line};border-radius:8px;background:${BRAND.surfaceLt};">
  <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND.ink};">${it.href ? `<a href="${it.href}" style="color:${BRAND.ink};text-decoration:none;">${escapeHtml(it.title)}</a>` : escapeHtml(it.title)}</p>
  ${it.body ? `<p style="margin:4px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">${escapeHtml(it.body)}</p>` : ''}
</div>`).join('')}
`).join('');

  const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your daily summary</h1>
<p style="margin:0 0 8px 0;font-size:14px;color:${BRAND.inkSoft};">${input.items.length} update${input.items.length === 1 ? '' : 's'} since your last digest, ${escapeHtml(input.dateLabel)}.</p>
${sections}
${ctaButton(input.appHref, 'Open Core OS 360')}
`.trim();

  return {
    subject: `Daily summary: ${input.items.length} update${input.items.length === 1 ? '' : 's'}`,
    html:    wrapEmail(body, `${input.items.length} updates waiting for you.`),
    tag:     'notification-digest',
  };
}
