// A deterministic prospect score, 0–100, from what the scans saw. It
// runs whether or not Jev answers, and its inputs are what Jev is shown.

export const BD_NEXT_ACTIONS = ['call', 'email_sequence', 'watch', 'dismiss'] as const;
export type BdNextAction = typeof BD_NEXT_ACTIONS[number];
export const BD_NEED = ['none', 'low', 'medium', 'high'] as const;

export interface ProspectSignals {
  roles_seen: number;
  active_roles: number;
  days_since_last_seen: number;
  high_repost: number;
  long_vacancy: number;
  volume_hiring: number;
  prior_status: string;      // prospect | contacted | client | not_relevant (any case)
  prior_contacts: number;    // notes / outreach so far, 0 when unknown
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function prospectScore(s: ProspectSignals): number {
  const status = s.prior_status.toLowerCase();
  if (status === 'client' || status === 'not_relevant') return 0;
  let score = 0;
  score += clamp(s.active_roles, 0, 5) * 8;                 // up to 40: live demand
  score += clamp(s.roles_seen - s.active_roles, 0, 5) * 3;   // up to 15: a hiring history
  score += s.high_repost > 0 ? 15 : 0;                       // a role they cannot fill
  score += s.long_vacancy > 0 ? 15 : 0;                      // a role open too long
  score += s.volume_hiring > 0 ? 15 : 0;                     // growing (40+15+15+15+15 = 100)
  score -= clamp(Math.floor(s.days_since_last_seen / 30), 0, 5) * 8;   // fading: −8 a month
  score -= status === 'contacted' ? 5 : 0;                   // already in a conversation
  return clamp(Math.round(score), 0, 100);
}

/** The deterministic fallback when Jev is off or unsure. */
export function fallbackNextAction(s: ProspectSignals, score: number): BdNextAction {
  const status = s.prior_status.toLowerCase();
  if (status === 'client' || status === 'not_relevant') return 'dismiss';
  if (s.days_since_last_seen > 120 && s.active_roles === 0) return 'dismiss';
  if (score >= 60) return 'call';
  if (score >= 30) return 'email_sequence';
  return 'watch';
}

/** Ltd / PLC / Limited stripped, punctuation collapsed, lower case: the
 *  same key bd_companies.company_name_normalised has always held. */
export function normaliseCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/[&+]/g, ' and ')
    .replace(/\b(limited|ltd|plc|llp|llc|inc|incorporated|co|company|group|holdings|uk)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}
