// The referral decision gate.
//
// PURE — no I/O, no imports beyond types. Every branch is reachable
// from a unit test, which matters because the failure mode here is
// silent: a gate that wrongly passes does not throw, it emails a
// stranger in the operator's name.
//
// Order is country → mandatory criteria → score, with one caveat
// worth stating plainly. The country gate genuinely runs first and
// short-circuits, so an ineligible applicant costs zero AI spend —
// that is the whole reason it is first. But mandatory criteria are
// DERIVED FROM the scan's skill_matches[], so they cannot literally
// precede the scan. They are evaluated after it and act as a VETO
// over the score, which is the behaviour actually wanted:
//
//     Score: 91%  →  FAIL, no evidence of MCP implementation
//
// So the real sequence is: country → [scan] → criteria veto → score.

import type {
  CountryGateResult,
  FailedCriterion,
  MandatoryCriterion,
  ReferralRoleConfig,
  ReferralStatus,
  ScanResult,
  ScanSkillMatch,
} from './types';

/** Below this, a skill_matches[] entry is not trusted as evidence.
 *  IvyLens omits confidence on some entries; an absent confidence is
 *  treated as sufficient (the model still asserted `found`), but an
 *  explicit low number is not. */
const MIN_SKILL_CONFIDENCE = 0.5;

export interface GateInput {
  /** Manatal's free-text candidate_location. */
  location: string | null | undefined;
  config:   ReferralRoleConfig;
  /** null when the candidate was gated out before scoring. */
  scan:     ScanResult | null;
}

export interface GateDecision {
  status:          ReferralStatus;
  /** 0-100, or null when no scan ran. */
  score:           number | null;
  countryResult:   CountryGateResult;
  countryDetected: string | null;
  failedCriteria:  FailedCriterion[];
  /** Human-readable trail, shown in the review queue and the funnel
   *  table. Every decision explains itself — "0 emailed" with no
   *  reasons is the state someone would otherwise have to debug. */
  reasons:         string[];
}

/* ─── Country ──────────────────────────────────────────────── */

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Common shorthands so an operator typing "UK" matches a candidate
 *  whose Manatal location reads "United Kingdom", and vice versa. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  'united kingdom': ['uk', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'gb'],
  'united states':  ['usa', 'us', 'united states of america', 'america'],
  'ireland':        ['republic of ireland', 'eire'],
  'united arab emirates': ['uae'],
};

function expand(country: string): string[] {
  const base = normalise(country);
  const out = new Set<string>([base]);
  for (const alias of COUNTRY_ALIASES[base] ?? []) out.add(normalise(alias));
  // Reverse direction: the operator may have typed the alias itself.
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.map(normalise).includes(base)) {
      out.add(normalise(canonical));
      for (const a of aliases) out.add(normalise(a));
    }
  }
  return [...out];
}

/** Match an approved country against a free-text location.
 *
 *  Manatal's candidate_location is whatever the applicant typed —
 *  "Ndola, Zambia", "United Kingdom", or bare "Manchester". So there
 *  are three outcomes and the third is load-bearing: a location we
 *  cannot resolve is UNKNOWN, never approved. Reading "unrecognised"
 *  as "fine" is how an ineligible applicant gets emailed. */
export function checkCountry(
  location: string | null | undefined,
  approvedCountries: string[],
): { result: CountryGateResult; detected: string | null } {
  const raw = (location ?? '').trim();
  if (!raw) return { result: 'unknown', detected: null };

  // An empty approved list refuses everyone. This gate fails CLOSED:
  // the cost of a wrong pass is an email that should never have been
  // sent, so "not configured" must not mean "allow all". The admin UI
  // refuses to enable a role with an empty list, but the gate does not
  // rely on the UI having done its job.
  if (!approvedCountries.length) return { result: 'rejected', detected: raw };

  // Location is usually "City, Country". Compare against the whole
  // normalised string AND each comma-separated segment, so
  // "Ndola, Zambia" resolves on its tail while "United Kingdom" and
  // "London United Kingdom" resolve on the whole.
  //
  // Split on commas BEFORE normalising — normalise() strips
  // punctuation, so splitting afterwards would find no commas left.
  const parts = [
    normalise(raw),
    ...raw.split(',').map(normalise),
  ].filter(Boolean);

  for (const approved of approvedCountries) {
    for (const variant of expand(approved)) {
      if (!variant) continue;
      for (const part of parts) {
        if (part === variant) return { result: 'approved', detected: raw };
        // Word-boundary containment, so "us" does not match "Belarus".
        const re = new RegExp(`(^|\\s)${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
        if (re.test(part)) return { result: 'approved', detected: raw };
      }
    }
  }

  // We have a location and it matched no approved country. That is a
  // genuine rejection, not an unknown — the string was readable, it
  // just is not on the list.
  //
  // A bare city we cannot place ("Manchester" with no country) is the
  // ambiguous case, and it lands here as `rejected` rather than
  // `unknown` only when it fails every variant. Callers route both
  // rejected and unknown away from auto-send; the distinction exists
  // so the review queue can show which happened.
  const looksLikeBareCity = !raw.includes(',') && raw.split(/\s+/).length <= 2;
  return { result: looksLikeBareCity ? 'unknown' : 'rejected', detected: raw };
}

/* ─── Mandatory criteria ───────────────────────────────────── */

function skillSatisfies(match: ScanSkillMatch, terms: string[]): boolean {
  // POSITIVE EVIDENCE ONLY.
  //
  // `found === false` is an explicit "the model looked and did not see
  // it". `found === undefined` is the model not answering — which is
  // NOT evidence either. Both fail. Only an explicit true counts.
  if (match.found !== true) return false;
  if (typeof match.confidence === 'number' && match.confidence < MIN_SKILL_CONFIDENCE) return false;

  const skill = normalise(match.skill ?? '');
  if (!skill) return false;

  return terms.some(term => {
    const t = normalise(term);
    if (!t) return false;
    return skill.includes(t) || t.includes(skill);
  });
}

/** Evaluate every mandatory criterion against the scan's skill_matches[].
 *
 *  THE TRAP THIS EXISTS TO AVOID: defaulting an unmentioned criterion
 *  to "pass". If the scan simply never mentions MCP, that is not
 *  evidence the candidate has MCP experience — it is the absence of
 *  evidence, and absence of evidence must not become absence of a
 *  fail. Inverting this default produces exactly the outcome the
 *  feature was specified to prevent: a candidate scoring 91% on
 *  adjacent AI experience who has never touched the mandatory skill.
 *
 *  So a criterion passes ONLY when some skill_matches[] entry names it
 *  AND asserts found === true. Everything else fails. */
export function checkMandatoryCriteria(
  criteria: MandatoryCriterion[],
  scan: ScanResult | null,
): FailedCriterion[] {
  if (!criteria.length) return [];

  // No scan at all means nothing was evidenced, so everything fails.
  const matches = scan?.skill_matches ?? [];

  const failed: FailedCriterion[] = [];
  for (const criterion of criteria) {
    const terms = criterion.match_terms ?? [];
    if (!terms.length) {
      // A criterion with no terms can never be evidenced. Treat it as
      // a configuration fault and fail it loudly rather than passing
      // it by accident.
      failed.push({
        key:    criterion.key,
        label:  criterion.label,
        reason: 'Criterion has no match terms configured — cannot be evidenced.',
      });
      continue;
    }

    const hit = matches.find(m => skillSatisfies(m, terms));
    if (hit) continue;

    // Distinguish "looked for it and the model said no" from "never
    // came up", purely so the review queue reads usefully. Both fail.
    const mentioned = matches.find(m => {
      const skill = normalise(m.skill ?? '');
      return terms.some(t => {
        const n = normalise(t);
        return n && skill && (skill.includes(n) || n.includes(skill));
      });
    });

    failed.push({
      key:   criterion.key,
      label: criterion.label,
      reason: mentioned
        ? `Named in the CV scan but not evidenced (found=${String(mentioned.found)}${
            typeof mentioned.confidence === 'number' ? `, confidence=${mentioned.confidence}` : ''
          }).`
        : 'No evidence found in the CV.',
    });
  }
  return failed;
}

/* ─── Score ────────────────────────────────────────────────── */

/** IvyLens returns overall_score as a 0.0-1.0 float.
 *
 *  Values above 1 are treated as already being on a 0-100 scale, which
 *  leaves 1.0-2.0 ambiguous (a float that overshot, or a genuine 1.4%).
 *  It resolves DOWNWARDS on purpose: a wrongly-high score emails a
 *  stranger in the operator's name, a wrongly-low one only fails to. */
export function toPercent(overallScore: number): number {
  if (!Number.isFinite(overallScore)) return 0;
  const pct = overallScore <= 1 ? overallScore * 100 : overallScore;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/* ─── The gate ─────────────────────────────────────────────── */

export function evaluate(input: GateInput): GateDecision {
  const { location, config, scan } = input;
  const reasons: string[] = [];

  // 1. Country — first, and short-circuiting, so an ineligible
  //    applicant never reaches an AI call.
  const country = checkCountry(location, config.approved_countries);
  if (country.result !== 'approved') {
    reasons.push(
      country.result === 'unknown'
        ? `Country could not be determined from "${country.detected ?? '(blank)'}" — not eligible for auto-send.`
        : `Location "${country.detected ?? '(blank)'}" is not in the approved country list.`,
    );
    return {
      status:          'rejected_country',
      score:           null,
      countryResult:   country.result,
      countryDetected: country.detected,
      failedCriteria:  [],
      reasons,
    };
  }
  reasons.push(`Location "${country.detected}" is in the approved country list.`);

  // A missing scan past the country gate means the scan itself failed.
  // Reported as a fault, never silently scored.
  if (!scan) {
    reasons.push('No scan result available — candidate was not scored.');
    return {
      status:          'scan_error',
      score:           null,
      countryResult:   country.result,
      countryDetected: country.detected,
      failedCriteria:  [],
      reasons,
    };
  }

  const score = toPercent(scan.overall_score);

  // 2. Mandatory criteria — a veto over the score, not a tiebreaker.
  const failedCriteria = checkMandatoryCriteria(config.mandatory_criteria ?? [], scan);
  if (failedCriteria.length) {
    reasons.push(
      `Scored ${score}% but failed ${failedCriteria.length} mandatory ` +
      `criteri${failedCriteria.length === 1 ? 'on' : 'a'}: ` +
      failedCriteria.map(f => f.label).join(', ') + '.',
    );
    return {
      status:          'rejected_criteria',
      score,
      countryResult:   country.result,
      countryDetected: country.detected,
      failedCriteria,
      reasons,
    };
  }
  if ((config.mandatory_criteria ?? []).length) {
    reasons.push('All mandatory criteria evidenced.');
  }

  // 3. Score.
  if (score >= config.auto_send_threshold) {
    reasons.push(`Scored ${score}%, at or above the ${config.auto_send_threshold}% auto-send threshold.`);
    return { status: 'qualified', score, countryResult: country.result, countryDetected: country.detected, failedCriteria: [], reasons };
  }
  if (score >= config.review_threshold) {
    reasons.push(`Scored ${score}%, between the ${config.review_threshold}% review and ${config.auto_send_threshold}% auto-send thresholds.`);
    return { status: 'review_pending', score, countryResult: country.result, countryDetected: country.detected, failedCriteria: [], reasons };
  }
  reasons.push(`Scored ${score}%, below the ${config.review_threshold}% review threshold.`);
  return { status: 'rejected_score', score, countryResult: country.result, countryDetected: country.detected, failedCriteria: [], reasons };
}
