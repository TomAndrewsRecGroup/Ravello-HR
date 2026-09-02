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
 *
 *  Verified against IvyLens core-api on 2026-08-26: `SkillMatch.confidence`
 *  is a plain `f64` with no `skip_serializing_if`, so this endpoint always
 *  sends it — the deterministic path uses 0.8 for a found required skill
 *  and 0.7 for a found preferred one, and the LLM prompt demands 0.0-1.0.
 *  An entry that reaches the `undefined` branch below therefore came from
 *  somewhere else, or from a future response shape; it is still accepted
 *  on an explicit `found === true`, because the model asserting the skill
 *  is itself the evidence. An explicit low number is not. */
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

/** Match a free-text location against the BLOCKED country list.
 *
 *  This is a block list as of migration 084 (operator, 2026-09-02). The
 *  allow list it replaced could only ever name countries somebody
 *  thought of in advance, so every country nobody typed was a refusal —
 *  it was refusing people the operator wanted.
 *
 *  Three outcomes, and the inversion changes what each one costs:
 *
 *    blocked — the location names a country on the list. Refused, and
 *              it short-circuits before the scan, so a blocked
 *              applicant still costs zero AI spend.
 *    clear   — readable, and on nobody's block list. Full pass.
 *    unknown — blank, or a location naming no country we can resolve
 *              ("Manchester" alone). NOT blocked: nothing here proves
 *              they are, and under a block list the burden is on the
 *              list. They are scanned and scored like anyone else, but
 *              `evaluate` caps them at review and they can never
 *              auto-send. See the cap there for why.
 *
 *  Note the fail direction has genuinely flipped, and it had to. An
 *  empty ALLOW list refused everybody, which is why the old gate could
 *  fail closed on a missing config. An empty BLOCK list blocks nobody —
 *  that is what the words mean, and pretending otherwise would make an
 *  unconfigured role silently refuse every applicant, which is the
 *  failure this repo keeps writing down. What carries the safety now is
 *  the auto-send cap on `unknown`, not a refusal here. */
export function checkCountry(
  location: string | null | undefined,
  blockedCountries: string[],
): { result: CountryGateResult; detected: string | null } {
  const raw = (location ?? '').trim();
  if (!raw) return { result: 'unknown', detected: null };

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

  for (const blocked of blockedCountries) {
    for (const variant of expand(blocked)) {
      if (!variant) continue;
      for (const part of parts) {
        if (part === variant) return { result: 'blocked', detected: raw };
        // Word-boundary containment, so "us" does not match "Belarus".
        const re = new RegExp(`(^|\\s)${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
        if (re.test(part)) return { result: 'blocked', detected: raw };
      }
    }
  }

  // Nothing on the block list matched. The remaining question is
  // whether a country was actually READ — which decides auto-send
  // eligibility, not eligibility itself.
  //
  // This must be answered by recognising country NAMES, not by shape.
  // A word count cannot do it: "Manchester" and "Luxembourg" are both
  // one word, and bare "United Kingdom" is two — and three of the live
  // rows are exactly that string, including ones that qualified. Any
  // shape heuristic either demotes them to review or promotes real
  // bare cities to auto-send.
  //
  // Measured over all 50 applications to date, every location either
  // carried a country ("London, England, United Kingdom", "Kraków,
  // Poland", "Sweden, Sweden") or was null; no bare city has actually
  // occurred. It is handled because Manatal's field is free text and
  // nothing stops one, not because it is common.
  return { result: namesAKnownCountry(parts) ? 'clear' : 'unknown', detected: raw };
}

/** Does any segment of the location name a country we recognise?
 *
 *  Only ever WIDENS eligibility — a country missing from this set makes
 *  its applicant `unknown`, which still gets scanned and still reaches
 *  the review queue. The cost of an omission is a manual look, not a
 *  lost candidate, so the list does not need to be perfect. It does
 *  need to cover everywhere people actually apply from. */
function namesAKnownCountry(parts: string[]): boolean {
  for (const part of parts) {
    if (KNOWN_COUNTRIES.has(part)) return true;
    // "london england united kingdom" as a whole string: look for a
    // country name inside it, on word boundaries.
    for (const c of KNOWN_COUNTRIES) {
      if (c.length < 4) continue; // "chad", "cuba" are fine; 2-3 letter codes are not
      const re = new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(part)) return true;
    }
  }
  return false;
}

const KNOWN_COUNTRIES: Set<string> = new Set([
  // Every alias already declared above, plus the canonical names.
  ...Object.entries(COUNTRY_ALIASES).flatMap(([k, v]) => [k, ...v]),
  'afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'argentina', 'armenia',
  'australia', 'austria', 'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados',
  'belarus', 'belgium', 'belize', 'benin', 'bhutan', 'bolivia', 'bosnia',
  'bosnia and herzegovina', 'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso',
  'burundi', 'cambodia', 'cameroon', 'canada', 'cape verde', 'chad', 'chile', 'china',
  'colombia', 'congo', 'costa rica', 'croatia', 'cuba', 'cyprus', 'czechia',
  'czech republic', 'denmark', 'djibouti', 'dominican republic', 'ecuador', 'egypt',
  'el salvador', 'estonia', 'eswatini', 'ethiopia', 'fiji', 'finland', 'france',
  'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'greece', 'guatemala', 'guinea',
  'guyana', 'haiti', 'honduras', 'hong kong', 'hungary', 'iceland', 'india',
  'indonesia', 'iran', 'iraq', 'israel', 'italy', 'ivory coast', 'jamaica', 'japan',
  'jordan', 'kazakhstan', 'kenya', 'kosovo', 'kuwait', 'kyrgyzstan', 'laos', 'latvia',
  'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein', 'lithuania', 'luxembourg',
  'macau', 'macedonia', 'north macedonia', 'madagascar', 'malawi', 'malaysia',
  'maldives', 'mali', 'malta', 'mauritania', 'mauritius', 'mexico', 'moldova',
  'monaco', 'mongolia', 'montenegro', 'morocco', 'mozambique', 'myanmar', 'namibia',
  'nepal', 'netherlands', 'holland', 'new zealand', 'nicaragua', 'niger', 'nigeria',
  'north korea', 'norway', 'oman', 'pakistan', 'palestine', 'panama', 'papua new guinea',
  'paraguay', 'peru', 'philippines', 'poland', 'portugal', 'qatar', 'romania', 'russia',
  'russian federation', 'rwanda', 'saudi arabia', 'senegal', 'serbia', 'seychelles',
  'sierra leone', 'singapore', 'slovakia', 'slovenia', 'somalia', 'south africa',
  'south korea', 'korea', 'south sudan', 'sri lanka', 'sudan', 'suriname', 'sweden',
  'switzerland', 'syria', 'taiwan', 'tajikistan', 'tanzania', 'thailand', 'togo',
  'trinidad and tobago', 'tunisia', 'turkey', 'turkiye', 'turkmenistan', 'uganda',
  'ukraine', 'uruguay', 'uzbekistan', 'venezuela', 'vietnam', 'yemen', 'zambia',
  'zimbabwe',
].map(normalise));

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
    if (!usableTerm(t)) return false;
    return skill.includes(t) || t.includes(skill);
  });
}

/** The shortest a normalised term may be before it stops discriminating.
 *
 *  `normalise` strips punctuation, so an operator typing **"C++"**
 *  produces the term `"c"` — and `t.includes(skill) || skill.includes(t)`
 *  then matches "JavaScript", "Docker", "Communication" and nearly
 *  everything else. A mandatory criterion would pass EVERY candidate
 *  while reading, in the UI, as a strict requirement.
 *
 *  That is the exact inversion of this module's rule: absence of
 *  evidence must fail, and a term that cannot discriminate is not
 *  evidence. Two characters is the floor — it keeps "QA" and "ML"
 *  usable while refusing a bare letter. */
const MIN_TERM_LENGTH = 2;

function usableTerm(normalisedTerm: string): boolean {
  return normalisedTerm.length >= MIN_TERM_LENGTH;
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
    // A criterion with no USABLE terms can never be evidenced honestly.
    // "No terms at all" and "only terms that normalise away to nothing"
    // are the same fault — the second is worse, because "C++" looks
    // like a real requirement in the UI while matching everything.
    // Both fail loudly rather than passing by accident.
    const usable = terms.filter(t => usableTerm(normalise(t)));
    if (!usable.length) {
      failed.push({
        key:    criterion.key,
        label:  criterion.label,
        reason: terms.length
          ? `Criterion's match terms (${terms.join(', ')}) are too short to discriminate once punctuation is stripped — cannot be evidenced.`
          : 'Criterion has no match terms configured — cannot be evidenced.',
      });
      continue;
    }

    const hit = matches.find(m => skillSatisfies(m, terms));
    if (hit) continue;

    // Distinguish "looked for it and the model said no" from "never
    // came up", purely so the review queue reads usefully. Both fail.
    const mentioned = matches.find(m => {
      const skill = normalise(m.skill ?? '');
      return usable.some(t => {
        const n = normalise(t);
        return usableTerm(n) && skill && (skill.includes(n) || n.includes(skill));
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

  // 1. Country — first, so a BLOCKED applicant never reaches an AI
  //    call. Only `blocked` short-circuits now: under a block list an
  //    unreadable location is not evidence of anything, so it is not a
  //    refusal. It costs a scan, and is capped at review below.
  const country = checkCountry(location, config.blocked_countries);
  if (country.result === 'blocked') {
    reasons.push(`Location "${country.detected}" is on the blocked country list.`);
    return {
      status:          'rejected_country',
      score:           null,
      countryResult:   country.result,
      countryDetected: country.detected,
      failedCriteria:  [],
      reasons,
    };
  }
  reasons.push(
    country.result === 'clear'
      ? `Location "${country.detected}" is not on the blocked country list.`
      : `No country could be read from "${country.detected ?? '(blank)'}" — not blocked, but held back from auto-send.`,
  );

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
    // THE AUTO-SEND CAP. An applicant whose country we could not read
    // is scanned and scored like anyone else, and may well score above
    // the bar — but is never emailed automatically. It goes to the
    // review queue instead, where a person decides.
    //
    // This is what carries the safety the old allow list used to carry
    // by refusing outright (operator decision, 2026-09-02). A block
    // list cannot refuse an unreadable location — nothing proves it is
    // blocked — so the property worth keeping is narrower and exact:
    // never send an email in the operator's name to someone we cannot
    // place. Reaching the queue costs a manual look; auto-sending here
    // would cost a stranger an email.
    if (country.result === 'unknown') {
      reasons.push(
        `Scored ${score}%, at or above the ${config.auto_send_threshold}% auto-send threshold, ` +
        `but the country could not be read — held for review rather than auto-sent.`,
      );
      return { status: 'review_pending', score, countryResult: country.result, countryDetected: country.detected, failedCriteria: [], reasons };
    }
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
