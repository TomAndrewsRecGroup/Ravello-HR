// Turning a live Manatal job into what the Athletes To Industry Thursday
// email shows. Pure — no network — so every rule here is unit-tested
// against real jobs read from the live account.
//
// Two rules that are easy to get wrong:
//
// * The client's name is carried for Tom's INTERNAL Match me
//   notification only (`clientName`). Nothing athlete-facing renders it:
//   ARG's own adverts never name the client ("a large-scale heavy
//   process manufacturing site near Macclesfield"), and the email must
//   not undo that.
//
// * The salary shows ONLY when Manatal's `is_salary_visible` is true —
//   the recruiter's own setting on the job. Both live roles read on
//   2026-10-28 had it false. Showing a figure the operator hid would be
//   publishing something he chose not to.

import * as cheerio from 'cheerio';

/** The fields of a v3 /jobs/ row this module reads. Measured live
 *  2026-10-28 (jobs 4467043, 4337074): `currency` is an ISO code string,
 *  `industry` is `{id, name}`, and there is no organisation name. */
export interface ManatalLiveJobRaw {
  id:                 number | string;
  position_name?:     string | null;
  description?:       string | null;
  organization?:      number | string | { id?: number | string; name?: string } | null;
  organization_name?: string | null;
  city?:              string | null;
  country?:           string | null;
  is_remote?:         boolean | null;
  salary_min?:        string | number | null;
  salary_max?:        string | number | null;
  currency?:          string | { code?: string } | null;
  currency_code?:     string | null;
  frequency?:         string | null;
  is_salary_visible?: boolean | null;
  contract_details?:  string | null;
  industry?:          { id?: number | string; name?: string } | number | string | null;
  industries_name?:   string | null;
  status?:            string | null;
  is_published?:      boolean | null;
  open_at?:           string | null;
  close_at?:          string | null;
}

/** One role as the email, the Match me page and Tom's notification
 *  use it. This exact shape is what `a2i_role_alert_sends.jobs` stores. */
export interface LiveRole {
  id:             string;
  title:          string;
  location:       string | null;
  contract:       string | null;
  salary:         string | null;
  industry:       string | null;
  summary:        string;
  /** INTERNAL ONLY — Tom's notification. Never rendered to an athlete. */
  clientName:     string | null;
  organizationId: string | null;
  openAt:         string | null;
}

/** Live means: active, published, and not past its own close date. */
export function isLiveJob(raw: ManatalLiveJobRaw, now: Date): boolean {
  if (raw.status !== 'active') return false;
  if (raw.is_published !== true) return false;
  if (raw.close_at) {
    const closes = Date.parse(raw.close_at);
    if (Number.isFinite(closes) && closes <= now.getTime()) return false;
  }
  return Boolean(raw.position_name && String(raw.position_name).trim());
}

const CONTRACT_LABELS: Record<string, string> = {
  full_time:      'Full-time',
  part_time:      'Part-time',
  temporary:      'Temporary',
  freelance:      'Freelance',
  internship:     'Internship',
  apprenticeship: 'Apprenticeship',
  contractor:     'Contract',
  consultancy:    'Consultancy',
};

export function contractText(v: string | null | undefined): string | null {
  if (!v) return null;
  return CONTRACT_LABELS[v] ?? null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

const FREQUENCY_LABELS: Record<string, string> = {
  year: 'per year', month: 'per month', week: 'per week', day: 'per day', hour: 'per hour',
};

function toAmount(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function currencyCode(raw: ManatalLiveJobRaw): string | null {
  if (typeof raw.currency === 'string' && raw.currency.trim()) return raw.currency.trim().toUpperCase();
  if (raw.currency && typeof raw.currency === 'object' && raw.currency.code) return raw.currency.code.toUpperCase();
  if (raw.currency_code) return raw.currency_code.toUpperCase();
  return null;
}

function money(n: number, code: string | null): string {
  const s = new Intl.NumberFormat('en-GB', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
  if (!code) return s;
  const sym = CURRENCY_SYMBOLS[code];
  return sym ? `${sym}${s}` : `${code} ${s}`;
}

/** "£40,000–£45,000 per year". Null when the salary is hidden on the
 *  job or there is no figure to show. */
export function salaryText(raw: ManatalLiveJobRaw): string | null {
  if (raw.is_salary_visible !== true) return null;
  const min = toAmount(raw.salary_min);
  const max = toAmount(raw.salary_max);
  if (min === null && max === null) return null;
  const code = currencyCode(raw);
  let range: string;
  if (min !== null && max !== null) range = min === max ? money(min, code) : `${money(min, code)}–${money(max, code)}`;
  else if (min !== null) range = `From ${money(min, code)}`;
  else range = `Up to ${money(max!, code)}`;
  const per = raw.frequency ? FREQUENCY_LABELS[raw.frequency] : undefined;
  return per ? `${range} ${per}` : range;
}

export function locationText(raw: ManatalLiveJobRaw): string | null {
  const place = (raw.city ?? '').trim() || (raw.country ?? '').trim();
  const parts = [place, raw.is_remote ? 'Remote' : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function industryText(raw: ManatalLiveJobRaw): string | null {
  if (raw.industry && typeof raw.industry === 'object' && raw.industry.name) return raw.industry.name.trim() || null;
  return raw.industries_name?.trim() || null;
}

function organizationId(raw: ManatalLiveJobRaw): string | null {
  const o = raw.organization;
  if (o === null || o === undefined) return null;
  if (typeof o === 'number' || typeof o === 'string') return String(o);
  return o.id === null || o.id === undefined ? null : String(o.id);
}

function organizationName(raw: ManatalLiveJobRaw): string | null {
  if (raw.organization_name?.trim()) return raw.organization_name.trim();
  const o = raw.organization;
  if (o && typeof o === 'object' && o.name?.trim()) return o.name.trim();
  return null;
}

const SUMMARY_MAX = 260;

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function sameText(a: string, b: string): boolean {
  const n = (s: string) => squash(s).toLowerCase().replace(/[–—-]/g, '-');
  return n(a) === n(b);
}

/** A plain-text teaser from Manatal's HTML description. Skips the
 *  title line and the short "Location | Salary | Permanent" header lines
 *  every advert opens with, then takes the first real paragraph(s). */
export function summaryText(descriptionHtml: string | null | undefined, title: string): string {
  if (!descriptionHtml) return '';
  const $ = cheerio.load(descriptionHtml);
  $('br').replaceWith('\n');
  const lines: string[] = [];
  $('p, li, h1, h2, h3, h4, h5, h6').each((_, el) => {
    for (const part of $(el).text().split('\n')) {
      const t = squash(part);
      if (t) lines.push(t);
    }
  });
  const body = lines.filter(l => !sameText(l, title));
  const start = body.findIndex(l => l.length >= 60 && !l.includes('|'));
  if (start === -1) return truncate(body[0] ?? '');
  let out = '';
  for (const line of body.slice(start)) {
    out = out ? `${out} ${line}` : line;
    if (out.length >= 200) break;
  }
  return truncate(out);
}

function truncate(s: string): string {
  if (s.length <= SUMMARY_MAX) return s;
  const cut = s.slice(0, SUMMARY_MAX);
  const at = cut.lastIndexOf(' ');
  return `${(at > 120 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

export function normaliseLiveJob(raw: ManatalLiveJobRaw): LiveRole {
  const title = squash(String(raw.position_name ?? ''));
  return {
    id:             String(raw.id),
    title,
    location:       locationText(raw),
    contract:       contractText(raw.contract_details),
    salary:         salaryText(raw),
    industry:       industryText(raw),
    summary:        summaryText(raw.description, title),
    clientName:     organizationName(raw),
    organizationId: organizationId(raw),
    openAt:         raw.open_at ?? null,
  };
}

/** Newest first, so a role opened this week leads the email. */
export function sortRoles(roles: LiveRole[]): LiveRole[] {
  return [...roles].sort((a, b) => {
    const ta = a.openAt ? Date.parse(a.openAt) : 0;
    const tb = b.openAt ? Date.parse(b.openAt) : 0;
    return tb - ta || a.title.localeCompare(b.title);
  });
}

/** The andrews-recruitment.com page for a role. The template is
 *  validated by migration 217's CHECK (https, contains {id}). */
export function roleUrl(template: string, jobId: string): string {
  return template.split('{id}').join(encodeURIComponent(jobId));
}

/** The fields of a stored role an athlete is allowed to see. The
 *  client name is deliberately absent. */
export function publicRoleFields(r: LiveRole) {
  return {
    id: r.id, title: r.title, location: r.location, contract: r.contract,
    salary: r.salary, industry: r.industry, summary: r.summary,
  };
}
