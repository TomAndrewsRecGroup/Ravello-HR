import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

// To the employee (no login; reached only by this link) when they're
// assigned a test. The same email regardless of source_type — what the
// link SHOWS differs (a quiz to answer vs. "open your test here"), the
// employee never needs to know which kind it is.

export interface HsTestInviteInput {
  employeeName: string;
  companyName:  string;
  testTitle:    string;
  sessionTitle: string | null;
  link:         string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hsTestInviteEmail(input: HsTestInviteInput) {
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Health &amp; Safety</p>
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">You've been asked to complete a test</h1>
<p style="margin:0 0 16px 0;">Hi ${esc(input.employeeName || 'there')}, ${esc(input.companyName || 'your employer')} has asked Core OS 360 to arrange the following for you.</p>
${infoCard([
    { label: 'Test',    value: esc(input.testTitle) },
    ...(input.sessionTitle ? [{ label: 'Session', value: esc(input.sessionTitle) }] : []),
  ])}
${ctaButton(input.link, 'Start')}
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkFaint};">This link is personal to you — please don't forward it.</p>
`.trim();

  return {
    subject: `Test to complete: ${input.testTitle}`.slice(0, 150),
    html:    wrapEmail(body, `${input.companyName || 'Your employer'} has asked you to complete: ${input.testTitle}`),
    tag:     'hs-test-invite',
  };
}
