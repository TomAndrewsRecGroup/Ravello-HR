// ─── Friction Lens API Client ─────────────────────────────────────────────────
// Calls the IvyLens Friction Lens API.
// Endpoint: POST /api/partner/roles/analyze
// Request:  { "text": "raw JD text", "title"?: string, "company"?: string }
// Response: { role_id, title, company, friction_score, clarity_score,
//             overload_score, required_skills, recommendations }
//
// All scores 0.0–1.0. Color: red (>0.65), amber (0.35–0.65), green (<0.35)
// If IVYLENS_API_URL is not set, falls back to local heuristic.
// Set in Vercel: IVYLENS_API_URL=https://api.ivylens.app (server-side only)

import type { FrictionScore, FrictionLevel, ExtractedRole } from '@/lib/supabase/types';

export interface RoleInput {
  jd_text: string;   // raw job description text
  title?:  string;   // optional role title
  company?: string;  // optional company name
}

export type { FrictionScore, FrictionLevel, ExtractedRole };

// Server-side only — not NEXT_PUBLIC_ so never exposed to browser
const API_URL = process.env.IVYLENS_API_URL ?? '';
const API_KEY = process.env.IVYLENS_API_KEY ?? '';

function levelFromScore(score: number): FrictionLevel {
  if (score < 35) return 'Low';
  if (score < 65) return 'Medium';
  if (score < 85) return 'High';
  return 'Critical';
}

function timeToFill(score: number): string {
  if (score < 35) return '2–4 weeks';
  if (score < 65) return '4–7 weeks';
  if (score < 85) return '7–12 weeks';
  return '12+ weeks';
}

// ─── Map IvyLens response → our FrictionScore ────────────────────────────────
// IvyLens returns scores as 0.0–1.0 floats. We multiply by 100 for display.
// Thresholds per spec: >0.65 = high (red), 0.35–0.65 = moderate (amber), <0.35 = low (green)
function mapIvyLensResponse(data: any): FrictionScore {
  const frictionScore = Math.round((data.friction_score ?? 0) * 100);
  const clarityScore  = Math.round((data.clarity_score ?? 0) * 100);
  const overloadScore = Math.round((data.overload_score ?? 0) * 100);
  const skillsCount   = data.required_skills?.length ?? 0;

  // Overall = weighted average: friction 50%, overload 30%, clarity 20%
  const overall = Math.round(frictionScore * 0.5 + overloadScore * 0.3 + clarityScore * 0.2);

  // Use IvyLens recommendations if provided, otherwise generate from scores
  const recommendations: string[] = data.recommendations?.length
    ? data.recommendations
    : generateRecommendations(frictionScore, overloadScore, clarityScore, skillsCount);

  const extracted_role: ExtractedRole = {
    title:           data.title           ?? undefined,
    location:        undefined,
    salary_min:      undefined,
    salary_max:      undefined,
    required_skills: data.required_skills ?? undefined,
    working_model:   undefined,
    seniority:       undefined,
    employment_type: undefined,
    department:      undefined,
  };

  return {
    overall_score:         overall,
    overall_level:         levelFromScore(overall),
    friction_score:        frictionScore,
    clarity_score:         clarityScore,
    overload_score:        overloadScore,
    required_skills_count: skillsCount,
    ivylens_role_id:       data.role_id ?? undefined,
    extracted_role,
    recommendations,
    time_to_fill_estimate: timeToFill(overall),
  };
}

function generateRecommendations(friction: number, overload: number, clarity: number, skills: number): string[] {
  const recs: string[] = [];
  if (friction >= 65) recs.push('High market competition for this role type. Consider broadening location or working model flexibility.');
  if (overload >= 65) recs.push(`${skills} required skills is above market norm. Reduce to 6–8 must-haves to widen the candidate pool.`);
  if (clarity >= 65)  recs.push('The job description lacks clarity on responsibilities or requirements. A clearer brief attracts stronger candidates.');
  if (recs.length === 0) recs.push('Role looks well-positioned. Proceed to market with confidence.');
  return recs;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function scoreFriction(input: RoleInput): Promise<FrictionScore> {
  if (!API_URL) {
    return localHeuristic(input.jd_text);
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    const endpoint = API_KEY
      ? `${API_URL}/api/partner/roles/analyze`
      : `${API_URL}/api/role/analyze`;

    // Spec requires field name "text" (not "jd_text")
    const body: Record<string, string> = { text: input.jd_text };
    if (input.title)   body.title   = input.title;
    if (input.company)  body.company = input.company;

    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn('[IvyLens] API returned', res.status);
      return localHeuristic(input.jd_text);
    }

    return mapIvyLensResponse(await res.json());
  } catch (err) {
    console.warn('[IvyLens] API unavailable, using local heuristic:', err);
    return localHeuristic(input.jd_text);
  }
}

// ─── Local heuristic fallback ─────────────────────────────────────────────────
// Parses raw JD text to estimate friction when IvyLens is unreachable.
export function localHeuristic(jdText: string): FrictionScore {
  const text  = jdText.toLowerCase();
  const words = text.split(/\s+/);

  // Clarity — check for presence of key sections
  const hasResponsibilities = /responsibilit|you will|key duties|role overview/.test(text);
  const hasRequirements     = /requirements|must.have|essential|you (will|should) have/.test(text);
  const hasTitle            = words.length > 10;
  const clarityRaw          = [hasResponsibilities, hasRequirements, hasTitle].filter(Boolean).length;
  const clarityScore        = Math.round((1 - clarityRaw / 3) * 100);

  // Overload — count bullet-point-like requirement lines
  const bulletLines      = (jdText.match(/^[\s]*[-•*]\s+.+/gm) ?? []).length;
  const yearsMatches     = (text.match(/\d+\+?\s+years?/g) ?? []).length;
  const skillsCount      = bulletLines + yearsMatches;
  const overloadScore    = skillsCount > 15 ? 90 : skillsCount > 10 ? 70 : skillsCount > 5 ? 45 : 20;

  // Friction — office-only + London is high friction
  let frictionScore = 30;
  if (/office.only|fully.on.?site|5 days/.test(text)) frictionScore += 30;
  if (/london/.test(text) && !/remote|hybrid/.test(text)) frictionScore += 20;
  if (!/salary|£|\bpay\b|\bcomp\b/.test(text)) frictionScore += 15;
  frictionScore = Math.min(frictionScore, 95);

  const overall = Math.round(frictionScore * 0.5 + overloadScore * 0.3 + clarityScore * 0.2);

  return {
    overall_score:         overall,
    overall_level:         levelFromScore(overall),
    friction_score:        frictionScore,
    clarity_score:         clarityScore,
    overload_score:        overloadScore,
    required_skills_count: skillsCount,
    recommendations:       generateRecommendations(frictionScore, overloadScore, clarityScore, skillsCount),
    time_to_fill_estimate: timeToFill(overall),
  };
}
