// Branded HTML email templates used by /api/enquiries. One layout,
// one source-specific result block. Everything inlined: most email
// clients strip <style> blocks.

const LOGO    = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';
const SITE    = 'https://thepeoplesystem.co.uk';
const PURPLE  = '#7C3AED';
const NAVY    = '#070B20';
const INK     = '#070B1D';
const INK_SOFT= '#38436A';
const LINE    = 'rgba(7,11,29,0.08)';
const BG      = '#EFF0F7';

export type EnquirySource =
  | 'hiring_score' | 'hr_risk' | 'policy_healthcheck' | 'due_diligence' | 'contact';

export interface EnquiryEmailInput {
  fullName: string;
  source:   EnquirySource;
  result?:  Record<string, unknown>;
}

export interface EnquiryEmail {
  subject: string;
  html:    string;
}

const SOURCE_LABEL: Record<EnquirySource, { name: string; toolUrl: string }> = {
  hiring_score:       { name: 'Smart Hiring Score',  toolUrl: `${SITE}/tools/hiring-score` },
  hr_risk:            { name: 'HR Risk Score',       toolUrl: `${SITE}/tools/hr-risk-score` },
  policy_healthcheck: { name: 'Policy Healthcheck',  toolUrl: `${SITE}/tools/policy-healthcheck` },
  due_diligence:      { name: 'DD Checklist',        toolUrl: `${SITE}/tools/due-diligence-checklist` },
  contact:            { name: 'enquiry',             toolUrl: SITE },
};

function shell(opts: { previewText: string; greeting: string; resultBlock: string; toolName: string }): string {
  const { previewText, greeting, resultBlock, toolName } = opts;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(toolName)} results | The People System</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${BG};">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${LINE};">
      <tr><td style="padding:32px 32px 8px;">
        <img src="${LOGO}" alt="The People System" width="160" style="height:auto;display:block;"/>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <div style="height:3px;background:linear-gradient(135deg,#EA3DC4 0%,#7C3AED 50%,#3B6FFF 100%);border-radius:3px;"></div>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${PURPLE};">Your ${escapeHtml(toolName)}</p>
        <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK};">${escapeHtml(greeting)}</h1>
      </td></tr>
      <tr><td style="padding:8px 32px 24px;">
        ${resultBlock}
      </td></tr>
      <tr><td style="padding:8px 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px;">
          <tr><td style="padding:24px;text-align:center;">
            <p style="margin:0 0 8px;color:#ffffff;font-weight:700;font-size:16px;">Want us to walk through your results?</p>
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:14px;line-height:1.5;">Book a free 20-minute call. No pitch. We will look at your specific results, point out the highest-leverage fixes, and tell you whether The People System is the right partner.</p>
            <a href="${SITE}/book" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#EA3DC4 0%,#7C3AED 50%,#3B6FFF 100%);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Book a Call</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0;color:${INK_SOFT};font-size:13px;line-height:1.6;">
          Three connected systems. One partner. <strong>HIRE</strong> embedded recruitment, <strong>LEAD</strong> leadership development, <strong>PROTECT</strong> HR foundations and Employment Rights Bill ready compliance.
        </p>
        <p style="margin:14px 0 0;color:${INK_SOFT};font-size:13px;line-height:1.6;">
          <a href="${SITE}/hire"    style="color:${PURPLE};text-decoration:none;font-weight:600;">HIRE</a>&nbsp;·&nbsp;
          <a href="${SITE}/lead"    style="color:${PURPLE};text-decoration:none;font-weight:600;">LEAD</a>&nbsp;·&nbsp;
          <a href="${SITE}/protect" style="color:${PURPLE};text-decoration:none;font-weight:600;">PROTECT</a>&nbsp;·&nbsp;
          <a href="${SITE}/why-tps" style="color:${PURPLE};text-decoration:none;font-weight:600;">Why TPS</a>
        </p>
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid ${LINE};background:${BG};">
        <p style="margin:0;color:#748099;font-size:11px;line-height:1.5;">
          The People System Ltd · UK HR consultancy · <a href="mailto:info@thepeoplesystem.co.uk" style="color:#748099;">info@thepeoplesystem.co.uk</a><br/>
          You received this email because you completed our ${escapeHtml(toolName)} on ${SITE}. Data handled under UK GDPR.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
}

function bigScore(value: string, label: string, tone: 'green' | 'amber' | 'red'): string {
  const colour = tone === 'green' ? '#16A34A' : tone === 'amber' ? '#D97706' : '#DC2626';
  const bg     = tone === 'green' ? '#ECFDF5' : tone === 'amber' ? '#FFFBEB' : '#FEF2F2';
  const border = tone === 'green' ? '#A7F3D0' : tone === 'amber' ? '#FDE68A' : '#FECACA';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:14px;padding:22px;text-align:center;">
    <p style="margin:0 0 4px;color:${INK_SOFT};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Your score</p>
    <p style="margin:0;color:${colour};font-size:46px;font-weight:800;line-height:1;letter-spacing:-0.03em;">${escapeHtml(value)}</p>
    <p style="margin:6px 0 0;color:${colour};font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(label)}</p>
  </div>`;
}

function bullets(title: string, items: string[]): string {
  if (!items.length) return '';
  const lis = items.map((i) => `<li style="margin:0 0 6px;color:${INK_SOFT};font-size:14px;line-height:1.5;">${escapeHtml(i)}</li>`).join('');
  return `<div style="margin-top:18px;">
    <p style="margin:0 0 8px;color:${INK};font-size:14px;font-weight:700;">${escapeHtml(title)}</p>
    <ul style="margin:0;padding-left:18px;">${lis}</ul>
  </div>`;
}

function toneFor(pct: number, lowerIsBetter = false): 'green' | 'amber' | 'red' {
  const score = lowerIsBetter ? 100 - pct : pct;
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

export function buildEnquiryEmail({ fullName, source, result = {} }: EnquiryEmailInput): EnquiryEmail {
  const meta = SOURCE_LABEL[source];
  const first = fullName.split(/\s+/)[0] || 'there';

  let subject = `Your ${meta.name} from The People System`;
  let resultBlock = '';
  let greeting = `Hi ${first}, here are your results.`;
  let preview  = `Your ${meta.name} results from The People System.`;

  if (source === 'hiring_score') {
    const pct  = Number(result.percentage  ?? 0);
    const score= Number(result.score ?? 0);
    const max  = Number(result.maxScore ?? 24);
    const weak = (result.weakAreas as string[] | undefined) ?? [];
    const tone = toneFor(pct);
    const label= tone === 'green' ? 'Strong' : tone === 'amber' ? 'Leaking' : 'Broken';
    subject    = `Your Smart Hiring Score: ${pct}% (${label})`;
    preview    = `${pct}% — ${label}. Open for the breakdown and your fix plan.`;
    greeting   = `Hi ${first}, your hiring is ${label.toLowerCase()}.`;
    resultBlock= bigScore(`${pct}%`, `${label} · ${score}/${max}`, tone)
               + bullets('Where your hiring is leaking', weak)
               + bullets('Your fix plan', [
                  '7 days: audit your last three hire failures and identify the common breakdown point.',
                  '30 days: roll out a structured scorecard and success profile template for every open role.',
                  '90 days: train hiring managers, reduce agency spend by 30 percent through direct sourcing.',
                ]);
  } else if (source === 'hr_risk') {
    const pct  = Number(result.percentage ?? 0);
    const risk = (result.riskAreas as string[] | undefined) ?? [];
    const tone = toneFor(pct, true);
    const label= tone === 'green' ? 'Low risk' : tone === 'amber' ? 'Moderate risk' : 'High risk';
    subject    = `Your HR Risk Score: ${label} (${pct}%)`;
    preview    = `${label}. ${pct}% exposure across the areas we measured.`;
    greeting   = `Hi ${first}, your HR risk profile is ${label.toLowerCase()}.`;
    resultBlock= bigScore(`${pct}%`, label, tone)
               + bullets('Highest exposure areas', risk)
               + bullets('Why this matters in 2026', [
                  'Day-1 unfair dismissal rights commence under the Employment Rights Bill.',
                  'Mean unfair dismissal award: £13,749. Mean discrimination award: £45,000+ (MoJ, 2023/24).',
                  'PROTECT closes these gaps before the commencement dates bite.',
                ]);
  } else if (source === 'policy_healthcheck') {
    const pct  = Number(result.percentage ?? 0);
    const gaps = (result.gaps as string[] | undefined) ?? [];
    const tone = toneFor(pct);
    const label= tone === 'green' ? 'Compliant' : tone === 'amber' ? 'Gaps to close' : 'Material gaps';
    subject    = `Your Policy Healthcheck: ${label}`;
    preview    = `${pct}% policy coverage. ${gaps.length} priority gap${gaps.length === 1 ? '' : 's'}.`;
    greeting   = `Hi ${first}, your policy stack is ${label.toLowerCase()}.`;
    resultBlock= bigScore(`${pct}%`, label, tone)
               + bullets('Priority gaps to close', gaps)
               + bullets('Employment Rights Bill commencement priorities', [
                  'Day-1 dismissal rights: contractual probation review.',
                  'Statutory sick pay reform: SSP policy and pay clauses.',
                  'Zero-hours and agency reform: working pattern review.',
                ]);
  } else if (source === 'due_diligence') {
    const pct  = Number(result.percentage ?? 0);
    const gaps = (result.gaps as string[] | undefined) ?? [];
    const tone = toneFor(pct);
    const label= tone === 'green' ? 'Deal ready' : tone === 'amber' ? 'Material gaps' : 'High risk';
    subject    = `Your DealReady People DD result: ${label}`;
    preview    = `${pct}% DD coverage. ${gaps.length} risk area${gaps.length === 1 ? '' : 's'}.`;
    greeting   = `Hi ${first}, here is your people DD readout.`;
    resultBlock= bigScore(`${pct}%`, label, tone)
               + bullets('Open risk areas', gaps)
               + bullets('Where deals usually break on people', [
                  'Missing or non-compliant employment contracts surfaced during legal DD.',
                  'TUPE measures letters drafted late or skipped altogether.',
                  'Undocumented incentive arrangements that change post-completion.',
                ]);
  } else {
    resultBlock = `<p style="margin:0;color:${INK_SOFT};font-size:14px;line-height:1.6;">Thanks for getting in touch. Lucy or Tom will reply personally within one business day.</p>`;
  }

  return {
    subject,
    html: shell({ previewText: preview, greeting, resultBlock, toolName: meta.name }),
  };
}

export function buildAdminNotification(input: {
  fullName:    string;
  email:       string;
  phone?:      string;
  companyName?:string;
  source:      EnquirySource;
  result?:     Record<string, unknown>;
}): EnquiryEmail {
  const meta = SOURCE_LABEL[input.source];
  const lines = [
    `<strong>Name:</strong> ${escapeHtml(input.fullName)}`,
    `<strong>Email:</strong> ${escapeHtml(input.email)}`,
    input.phone       ? `<strong>Phone:</strong> ${escapeHtml(input.phone)}`             : null,
    input.companyName ? `<strong>Company:</strong> ${escapeHtml(input.companyName)}`     : null,
    `<strong>Source:</strong> ${meta.name}`,
    input.result && Object.keys(input.result).length
      ? `<strong>Result:</strong><br/><pre style="background:#f4f5fb;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">${escapeHtml(JSON.stringify(input.result, null, 2))}</pre>`
      : null,
  ].filter(Boolean).join('<br/>');

  return {
    subject: `New enquiry: ${input.fullName} (${meta.name})`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:${INK};font-size:14px;line-height:1.7;">
      <h2 style="margin:0 0 12px;">New enquiry from ${escapeHtml(meta.name)}</h2>
      ${lines}
      <p style="margin-top:16px;color:${INK_SOFT};font-size:12px;">View in admin: ${SITE}/admin (Enquiries)</p>
    </div>`,
  };
}
