import { wrapEmail, infoCard, BRAND } from '../layout';

// To the employee (no login; reached by email) when their leave
// request is received and when it is decided. Filled from the row and,
// for a refusal, the manager's own reason from employee_notes.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface LeaveRequestedInput { employeeName: string; companyName: string; typeLabel: string; startDate: string; endDate: string | null; days: number | null }

export function leaveRequestedEmail(i: LeaveRequestedInput) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your leave request has been received</h1>
<p style="margin:0 0 16px 0;">Hi ${esc(i.employeeName.split(' ')[0] || i.employeeName)}, your request has gone to ${esc(i.companyName || 'your manager')} for approval. You will get another email when it is decided.</p>
${infoCard([
    { label: 'Type',  value: esc(i.typeLabel) },
    { label: 'From',  value: esc(i.startDate) },
    { label: 'To',    value: esc(i.endDate ?? i.startDate) },
    ...(i.days != null ? [{ label: 'Days', value: String(i.days) }] : []),
  ])}
`.trim();
  return { subject: `Leave request received: ${i.startDate}`, html: wrapEmail(body, `Your ${i.typeLabel.toLowerCase()} request from ${i.startDate} is awaiting approval.`), tag: 'leave-requested' };
}

export interface LeaveDecisionInput extends LeaveRequestedInput { approved: boolean; reason: string | null }

export function leaveDecisionEmail(i: LeaveDecisionInput) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your leave request has been ${i.approved ? 'approved' : 'declined'}</h1>
<p style="margin:0 0 16px 0;">Hi ${esc(i.employeeName.split(' ')[0] || i.employeeName)}, ${esc(i.companyName || 'your manager')} has ${i.approved ? 'approved' : 'declined'} your request.</p>
${infoCard([
    { label: 'Type',  value: esc(i.typeLabel) },
    { label: 'From',  value: esc(i.startDate) },
    { label: 'To',    value: esc(i.endDate ?? i.startDate) },
    ...(i.days != null ? [{ label: 'Days', value: String(i.days) }] : []),
  ])}
${!i.approved && i.reason ? `<div style="margin:16px 0;padding:14px 16px;border-left:3px solid ${BRAND.purple};background:${BRAND.surfaceLt};border-radius:0 8px 8px 0;">
  <p style="margin:0 0 6px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Reason given</p>
  <p style="margin:0;font-size:14px;color:${BRAND.inkSoft};white-space:pre-wrap;">${esc(i.reason)}</p>
</div>` : ''}
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkFaint};">If you have a question about this, speak to your manager.</p>
`.trim();
  return { subject: `Leave ${i.approved ? 'approved' : 'declined'}: ${i.startDate}`, html: wrapEmail(body, `Your leave from ${i.startDate} was ${i.approved ? 'approved' : 'declined'}.`), tag: i.approved ? 'leave-approved' : 'leave-declined' };
}
