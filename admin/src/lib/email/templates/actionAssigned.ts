import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

export interface ActionAssignedInput {
  to:           string | string[];
  companyName:  string;
  title:        string;
  description?: string;
  /** Human-readable priority (Low / Normal / High / Urgent). */
  priorityLabel: string;
  /** ISO date string or pre-formatted "12 May 2026". Optional. */
  dueDate?:     string;
  /** Deep-link to /actions in the portal. */
  actionsUrl:   string;
}

export function actionAssignedEmail(input: ActionAssignedInput) {
  const rows: { label: string; value: string }[] = [
    { label: 'Priority', value: input.priorityLabel },
  ];
  if (input.dueDate) rows.push({ label: 'Due',  value: input.dueDate });

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">A new action is waiting for you</h1>
<p style="margin:0 0 16px 0;">Your account team at The People System has added a new action to your <strong>${input.companyName}</strong> portal:</p>
<div style="margin:16px 0;padding:16px;border:1px solid ${BRAND.line};border-radius:10px;background:${BRAND.surfaceLt};">
  <p style="margin:0 0 6px 0;font-size:15px;font-weight:600;color:${BRAND.ink};">${input.title}</p>
  ${input.description ? `<p style="margin:0;font-size:13px;color:${BRAND.inkSoft};">${input.description}</p>` : ''}
</div>
${infoCard(rows)}
${ctaButton(input.actionsUrl, 'Open actions')}
`.trim();

  return {
    to:      input.to,
    subject: `New action: ${input.title}`,
    html:    wrapEmail(body, `${input.title} — ${input.priorityLabel}${input.dueDate ? ' · due ' + input.dueDate : ''}`),
    tag:     'action-assigned',
  };
}
