// ─── Friction Lens API Client ─────────────────────────────────────────────────
// Calls the IvyLens Friction Lens API (Actix-web — public, no auth required).
// Endpoint: POST /api/role/analyze
// Request:  { "jd_text": "raw job description text" }
// Response: { "role": RoleModel, "friction": FrictionOutput }
//
// If IVYLENS_API_URL is not set, falls back to local heuristic.
// Set in Vercel: IVYLENS_API_URL=https://ivy-lens.vercel.app (server-side only)

import type { FrictionScore, FrictionLevel, ExtractedRole } from '@/lib/supabase/types';

export interface RoleInput {
  jd_text: string;   // raw job description text — IvyLens extracts structure from this
}

export type { FrictionScore, FrictionLevel, ExtractedRole };

// Server-side only — not NEXT_PUBLIC_ so never exposed to browser
const API_URL = process.env.IVYLENS_API_URL ?? '';
const API_KEY = process.env.IVYLENS_API_KEY ?? '';

function levelFromScore(score: number): FrictionLevel {
  if (score < 25) return 'Low';
  if (score < 50) return 'Medium';
  if (score < 75) return 'High';
  return 'Critical';
}

function timeToFill(score: number): string {
  if (score < 25) return '2–4 weeks';
  if (score < 50) return '4–7 weeks';
  if (score < 75) return '7–12 weeks';
  return '12+ weeks';
}

// ─── Map IvyLens response → our FrictionScore ────────────────────────────────
// IvyLens friction values are 0–1 floats. We multiply by 100 for display.
function mapIvyLensResponse(data: any): FrictionScore {
  const friction = data.friction ?? {};
  const role     = data.role     ?? {};

  const frictionScore = Math.round((friction.friction_score ?? 0) * 100);
  const clarityScore  = Math.round((1 - (friction.clarity_score ?? 1)) * 100); // invert: high clarity = low friction
  const overloadScore = Math.round((friction.overload_score ?? 0) * 100);
  const skillsCount   = friction.required_skills_count ?? role.required_skills?.length ?? 0;

  // Overall = weighted average: friction 50%, overload 30%, clarity 20%
  const overall = Math.round(frictionScore * 0.5 + overloadScore * 0.3 + clarityScore * 0.2);

  const recommendations: string[] = [];
  if (frictionScore >= 75) recommendations.push('High market competition for this role type. Consider broadening location or working model flexibility.');
  if (overloadScore >= 70) recommendations.push(`${skillsCount} required skills is above market norm. Review which are genuine requirements vs. preferences.`);
  if (clarityScore >= 70)  recommendations.push('The job description lacks clarity on responsibilities or requirements. A clearer brief attracts stronger candidates.');
  if (recommendations.length === 0) recommendations.push('Role looks well-positioned. Proceed to market with confidence.');

  const extracted_role: ExtractedRole = {
    title:           role.title           ?? undefined,
    location:        role.location        ?? undefined,
    salary_min:      role.salary_min      ?? undefined,
    salary_max:      role.salary_max      ?? undefined,
    required_skills: role.required_skills ?? undefined,
    working_model:   role.working_model   ?? undefined,
    seniority:       role.seniority       ?? undefined,
    employment_type: role.employment_type ?? undefined,
    department:      role.department      ?? undefined,
  };

  return {
    overall_score:         overall,
    overall_level:         levelFromScore(overall),
    friction_score:        frictionScore,
    clarity_score:         clarityScore,
    overload_score:        overloadScore,
    required_skills_count: skillsCount,
    extracted_role,
    recommendations,
    time_to_fill_estimate: timeToFill(overall),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function scoreFriction(input: RoleInput): Promise<FrictionScore> {
  if (!API_URL) {
    return localHeuristic(input.jd_text);
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    // Use partner endpoint if API key is set, otherwise fall back to public endpoint
    const endpoint = API_KEY
      ? `${API_URL}/api/partner/roles/analyze`
      : `${API_URL}/api/role/analyze`;

    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ jd_text: input.jd_text }),
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

  const recommendations: string[] = [];
  if (frictionScore >= 70) recommendations.push('Consider stating salary range and working model flexibility to reduce friction.');
  if (overloadScore >= 70) recommendations.push('The requirements list appears long. Aim for 5–7 must-haves to broaden the candidate pool.');
  if (clarityScore >= 70)  recommendations.push('Add clear responsibilities and requirements sections to attract better-matched candidates.');
  if (recommendations.length === 0) recommendations.push('Role looks well-positioned for market. Friction Lens will provide a full score once IvyLens is connected.');

  return {
    overall_score:         overall,
    overall_level:         levelFromScore(overall),
    friction_score:        frictionScore,
    clarity_score:         clarityScore,
    overload_score:        overloadScore,
    required_skills_count: skillsCount,
    recommendations,
    time_to_fill_estimate: timeToFill(overall),
  };
}
