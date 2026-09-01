// Translating a requisition into the fields Manatal will accept.
//
// Pure, and separate from the publish route, because every one of these
// failed SILENTLY on the first real role published (job 4337074,
// 2026-09-01): the job was created, reported live, and arrived in
// Manatal with no salary, no remote flag, and the wrong contract type.
// Nothing errored — Manatal simply took what it was given.

import type { ManatalContractDetails } from './manatal';

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
