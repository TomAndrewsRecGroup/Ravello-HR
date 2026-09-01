// Translating a requisition into the fields Manatal will accept.
//
// Pure, and separate from the publish route, because every one of these
// failed SILENTLY on the first real role published (job 4337074,
// 2026-09-01): the job was created, reported live, and arrived in
// Manatal with no salary, no remote flag, and the wrong contract type.
// Nothing errored — Manatal simply took what it was given.

import type { CreateJobArgs, ManatalContractDetails } from './manatal';
import { manatalDescriptionHtml } from './manatalDescription';

/* ─── Contract type ────────────────────────────────────────── */

const MANATAL_CONTRACT: ReadonlySet<string> = new Set([
  'full_time', 'part_time', 'temporary', 'freelance',
  'internship', 'apprenticeship', 'contractor', 'consultancy',
]);

/**
 * The admin form's employment types and Manatal's enum are DISJOINT
 * vocabularies — that is the whole problem.
 *
 * The form offers Permanent / Fixed-term / Contract / Interim. Manatal
 * accepts full_time / part_time / temporary / freelance / internship /
 * apprenticeship / contractor / consultancy. Normalising case and
 * punctuation matches NONE of them, so every role fell through to null,
 * the field was omitted from the create body, and Manatal defaulted the
 * job to `full_time` — including the contract role that started this.
 */
const ALIASES: Record<string, ManatalContractDetails> = {
  permanent:   'full_time',
  perm:        'full_time',
  'fixed_term':'temporary',
  fixed:       'temporary',
  ftc:         'temporary',
  contract:    'contractor',
  interim:     'contractor',
  freelance:   'freelance',
  temp:        'temporary',
  temporary:   'temporary',
  consultant:  'consultancy',
  'part_time': 'part_time',
};

export function manatalContractDetails(
  input: string | null | undefined,
): ManatalContractDetails | null {
  if (!input) return null;
  const v = input.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (MANATAL_CONTRACT.has(v)) return v as ManatalContractDetails;
  return ALIASES[v] ?? null;
}

/* ─── Salary ───────────────────────────────────────────────── */

export interface SalarySource {
  salary_min?:   number | null;
  salary_max?:   number | null;
  salary_range?: string | null;
}

export interface SalaryOut { min: number | null; max: number | null }

/** Parse "£40k-£60k" and similar. Kept as the FALLBACK only. */
export function parseSalaryRange(s: string | null | undefined): SalaryOut {
  if (!s) return { min: null, max: null };
  const nums = s.replace(/[£,$,]/g, '').match(/(\d+(?:\.\d+)?)(k)?/gi) ?? [];
  const vals = nums.map(n => {
    const k = /k$/i.test(n);
    const v = parseFloat(n.replace(/k$/i, ''));
    return k ? v * 1000 : v;
  }).filter(n => !isNaN(n) && n > 0).map(Math.round);
  if (vals.length === 0) return { min: null, max: null };
  if (vals.length === 1) return { min: vals[0], max: vals[0] };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/**
 * The salary to send.
 *
 * The columns come FIRST. The publish route read `salary_range` only —
 * a TEXT column the admin form never writes — while the form stores
 * `salary_min` / `salary_max` as integers. So the parse ran on null,
 * returned nulls, and every published job reached Manatal with no
 * salary at all. Measured on job 4337074: 60/120 in our database,
 * `salary_min: null, salary_max: null` in Manatal.
 *
 * `salary_range` stays as a fallback for rows that carry only the free
 * text (the portal's form, and anything imported).
 */
export function manatalSalary(src: SalarySource): SalaryOut {
  const positive = (n: unknown) => (typeof n === 'number' && isFinite(n) && n > 0 ? n : null);
  const min = positive(src.salary_min);
  const max = positive(src.salary_max);
  // One-sided is legitimate ("from £60,000"), and Manatal wants a pair,
  // so the present figure fills both ends rather than leaving a null the
  // job boards would render as an open range.
  if (min !== null || max !== null) return { min: min ?? max, max: max ?? min };
  return parseSalaryRange(src.salary_range ?? null);
}

/* ─── Salary period, currency, visibility ──────────────────── */

/** Manatal's `frequency`. Observed live on this account: `year` on
 *  every role Tom created by hand, `hour` on the one he corrected.
 *  The others are Manatal's standard set. */
export const MANATAL_SALARY_PERIODS = ['year', 'month', 'week', 'day', 'hour'] as const;
export type ManatalSalaryPeriod = typeof MANATAL_SALARY_PERIODS[number];

/**
 * Returns null for anything unrecognised, and null OMITS the field.
 *
 * That is deliberate rather than defaulting to `year`: the role that
 * exposed all of this pays **$60–$120 per hour**, and a confident
 * default would have advertised it as £60–£120 a year on every job
 * board — a wrong number is worse than an absent one, and it is the
 * kind of wrong that generates applications.
 */
export function manatalFrequency(input: string | null | undefined): ManatalSalaryPeriod | null {
  if (!input) return null;
  const v = input.trim().toLowerCase().replace(/^per\s+/, '').replace(/ly$/, '');
  const ALIASES: Record<string, ManatalSalaryPeriod> = {
    year: 'year', annum: 'year', annual: 'year', pa: 'year', yr: 'year',
    month: 'month', mth: 'month', pcm: 'month',
    week: 'week', wk: 'week',
    day: 'day', daily: 'day', diem: 'day',
    hour: 'hour', hr: 'hour', hourly: 'hour',
  };
  return ALIASES[v] ?? null;
}

/** ISO-4217, uppercased. Anything that is not three letters is refused
 *  rather than passed through — Manatal validates this and a bad value
 *  fails the whole create. */
export function manatalCurrency(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

/** Manatal stores an integer. Zero and negatives are not a headcount. */
export function manatalHeadcount(input: unknown): number | null {
  const n = typeof input === 'string' ? Number(input) : input;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

/* ─── Location ─────────────────────────────────────────────── */

export interface ManatalPlace {
  address: string;
  city:    string;
  state:   string;
  country: string;
}

/**
 * Countries this account actually advertises in. Recognised ONLY as
 * the trailing segment of a location.
 *
 * Kept short on purpose. An unrecognised trailing segment leaves
 * `country` empty rather than guessing: a wrong country on a job board
 * is a wrong audience, and "Cambridge" alone is a real place in three
 * of them.
 */
const COUNTRIES: Record<string, string> = {
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', gb: 'United Kingdom',
  gbr: 'United Kingdom', 'united kingdom': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom',
  wales: 'United Kingdom', 'northern ireland': 'United Kingdom',
  ireland: 'Ireland', ie: 'Ireland', roi: 'Ireland', eire: 'Ireland',
  usa: 'United States', us: 'United States', 'u.s.': 'United States',
  'united states': 'United States',
  canada: 'Canada', australia: 'Australia',
  germany: 'Germany', france: 'France', spain: 'Spain',
  netherlands: 'Netherlands', poland: 'Poland', india: 'India',
};

/**
 * Split our single free-text `location` into Manatal's four fields.
 *
 * We were sending the whole string as `address` and leaving `city`,
 * `state` and `country` empty — so the live job read
 * `address: "London, UK"`, `city: ""`, `country: ""`, and Tom had to
 * fill the other two in by hand. Every job he creates natively carries
 * `city` and `country`, which is what job boards filter and sort on:
 * a role with no city is a role nobody finds by searching their own
 * town.
 *
 * `address` keeps the original string. It is genuinely the free-text
 * address, it is what the live job carries today, and dropping it
 * would lose "Unit 4, Trading Estate" detail that fits no other field.
 */
export function splitLocation(location: string | null | undefined): ManatalPlace {
  const raw = (location ?? '').trim();
  const empty: ManatalPlace = { address: '', city: '', state: '', country: '' };
  if (!raw) return empty;

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return empty;

  let country = '';
  const mapped = COUNTRIES[parts[parts.length - 1].toLowerCase()];
  // A lone "UK" is a country and not a city — there is no city left to
  // take, so consuming it would give a location with no city at all.
  if (mapped && parts.length > 1) {
    country = mapped;
    parts.pop();
  } else if (mapped) {
    return { address: raw, city: '', state: '', country: mapped };
  }

  const city  = parts[0] ?? '';
  const state = parts.length > 1 ? parts.slice(1).join(', ') : '';
  return { address: raw, city, state, country };
}

/* ─── Remote ───────────────────────────────────────────────── */

/**
 * `is_remote` was never sent, so a fully remote role advertised as
 * remote in our system appeared in Manatal — and on the job boards it
 * syndicates to — without the remote flag, which is one of the strongest
 * filters a candidate applies.
 *
 * Returns null rather than false for an unknown value: null omits the
 * field and lets Manatal keep its own default, where false is a positive
 * assertion that the role is on-site.
 */
export function manatalIsRemote(workingModel: string | null | undefined): boolean | null {
  if (!workingModel) return null;
  const v = workingModel.trim().toLowerCase();
  if (v === 'remote') return true;
  if (v === 'office' || v === 'onsite' || v === 'on_site' || v === 'on-site') return false;
  // Hybrid is genuinely neither, and Manatal has no hybrid flag.
  return null;
}

/* ─── The whole mapping, in one place ──────────────────────── */

/** The requisition columns the Manatal create reads. Deliberately a
 *  loose shape: the row arrives from PostgREST, not from a generated
 *  type, and every field is optional on our side. */
export interface RequisitionForManatal {
  id?:                  string;
  title?:               string;
  description?:         string | null;
  location?:            string | null;
  employment_type?:     string | null;
  working_model?:       string | null;
  salary_min?:          number | null;
  salary_max?:          number | null;
  salary_range?:        string | null;
  salary_currency?:     string | null;
  salary_period?:       string | null;
  salary_visible?:      boolean | null;
  headcount?:           number | null;
  manatal_industry_id?: string | null;
  must_haves?:          string[] | null;
  nice_to_haves?:       string[] | null;
}

/**
 * Everything we send Manatal when publishing a role.
 *
 * This exists as ONE function because the defect it fixes was spread
 * across a route: three fields mapped wrongly, four never sent, and
 * the description sent in a format Manatal does not render. None of it
 * errored — Manatal stored exactly what it was given, and the job went
 * live wrong. "What reaches Manatal" is therefore the property worth
 * asserting, and it cannot be asserted while it is inline in a handler
 * behind auth, a rate limiter and a Supabase read.
 */
export function buildManatalJobArgs(
  req: RequisitionForManatal,
  organizationId: string,
): CreateJobArgs {
  const { min, max } = manatalSalary(req);
  const place = splitLocation(req.location);
  return {
    organizationId,
    title:           req.title ?? '',
    description:     manatalDescriptionHtml({
      description:   req.description,
      must_haves:    req.must_haves,
      nice_to_haves: req.nice_to_haves,
    }),
    address:         place.address,
    city:            place.city,
    state:           place.state,
    country:         place.country,
    contractDetails: manatalContractDetails(req.employment_type),
    isRemote:        manatalIsRemote(req.working_model),
    salaryMin:       min,
    salaryMax:       max,
    // GBP remains the fallback because this is a UK consultancy and
    // every historical role is sterling — but a stored currency now
    // wins, which the hardcoded value could not do.
    currency:        manatalCurrency(req.salary_currency) ?? 'GBP',
    frequency:       manatalFrequency(req.salary_period),
    isSalaryVisible: typeof req.salary_visible === 'boolean' ? req.salary_visible : null,
    headcount:       manatalHeadcount(req.headcount),
    industryId:      req.manatal_industry_id ?? null,
    externalId:      req.id ?? null,
  };
}
