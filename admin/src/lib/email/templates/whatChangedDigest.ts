import { wrapEmail, ctaButton, BRAND } from '../layout';
import type { WhatChangedSummary } from '@/lib/whatChanged/compute';

// Core-OS 360 Completion Programme, Phase 25, Group 5 (C9.5): the
// scheduled email half of the client-facing What Changed page (Group
// 4). Same COUNTS-ONLY discipline as that page and its own
// computeWhatChanged() — a categorised count, never an itemised feed,
// never a risk judgement.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function whatChangedDigestEmail(input: {
  summary: WhatChangedSummary;
  /** e.g. "yesterday, 29 September 2026" or "the week of 22 September 2026". */
  periodLabel: string;
  frequency: 'daily' | 'weekly';
  whatChangedUrl: string;
}) {
  const { summary, periodLabel, frequency, whatChangedUrl } = input;
  const rows = summary.categories.slice(0, 20).map(c =>
    `<tr><td style="padding:4px 12px 4px 0;font-size:14px;color:${BRAND.ink};">${esc(c.label)}</td><td style="padding:4px 0;font-size:14px;color:${BRAND.inkSoft};text-align:right;">${c.total}</td></tr>`,
  ).join('');
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">What Changed &middot; ${frequency === 'daily' ? 'Daily' : 'Weekly'} digest</p>
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">${summary.totalEvents} change${summary.totalEvents === 1 ? '' : 's'} for your organisation</h1>
<p style="margin:0 0 16px 0;font-size:14px;color:${BRAND.inkSoft};">${esc(periodLabel)}. ${summary.humanActorCount} by people, ${summary.systemActorCount} automated.</p>
${summary.categories.length === 0
    ? `<p style="margin:4px 0 12px 0;font-size:13px;color:${BRAND.inkFaint};">Nothing changed in this period.</p>`
    : `<table style="width:100%;border-collapse:collapse;margin:4px 0 16px 0;">${rows}</table>`}
${ctaButton(whatChangedUrl, 'View in full')}
`.trim();
  return {
    subject: `What Changed: ${summary.totalEvents} change${summary.totalEvents === 1 ? '' : 's'} — ${periodLabel}`,
    html: wrapEmail(body, `${summary.totalEvents} changes for your organisation, ${periodLabel}.`),
    tag: `what-changed-digest-${frequency}`,
  };
}
