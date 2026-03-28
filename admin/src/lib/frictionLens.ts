// ─── Friction Lens API Client (Admin) ────────────────────────────────────────
// Mirror of portal/src/lib/frictionLens.ts — kept in sync manually.
// Calls IvyLens POST /api/role/analyze with raw JD text.

import type { FrictionScore, FrictionLevel, ExtractedRole } from '@/lib/supabase/types';

export interface RoleInput {
  jd_text: string;
}

export type { FrictionScore, FrictionLevel, ExtractedRole };

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

function mapIvyLensResponse(data: any): FrictionScore {
  const friction = data.friction ?? {};
  const role     = data.role     ?? {};

  const frictionScore = Math.round((friction.friction_score ?? 0) * 100);
  const clarityScore  = Math.round((1 - (friction.clarity_score ?? 1)) * 100);
  const overloadScore = Math.round((friction.overload_score ?? 0) * 100);
  const skillsCount   = friction.required_skills_count ?? role.required_skills?.length ?? 0;
  const overall       = Math.round(frictionScore * 0.5 + overloadScore * 0.3 + clarityScore * 0.2);

  const recommendations: string[] = [];
  if (frictionScore >= 75) recommendations.push('High market competition for this role type. Consider broadening location or working model flexibility.');
  if (overloadScore >= 70) recommendations.push(`${skillsCount} required skills is above market norm. Review which are genuine requirements vs. preferences.`);
  if (clarityScore >= 70)  recommendations.push('The job description lacks clarity on responsibilities or requirements.');
  if (recommendations.length === 0) recommendations.push('Role looks well-positioned. Proceed to market with confidence.');

  return {
    overall_score:         overall,
    overall_level:         levelFromScore(overall),
    friction_score:        frictionScore,
    clarity_score:         clarityScore,
    overload_score:        overloadScore,
    required_skills_count: skillsCount,
    extracted_role: {
      title:           role.title           ?? undefined,
      location:        role.location        ?? undefined,
      salary_min:      role.salary_min      ?? undefined,
      salary_max:      role.salary_max      ?? undefined,
      required_skills: role.required_skills ?? undefined,
      working_model:   role.working_model   ?? undefined,
      seniority:       role.seniority       ?? undefined,
      employment_type: role.employment_type ?? undefined,
      department:      role.department      ?? undefined,
    },
    recommendations,
    time_to_fill_estimate: timeToFill(overall),
  };
}

export async function scoreFriction(input: RoleInput): Promise<FrictionScore> {
  if (!API_URL) return localHeuristic(input.jd_text);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    const endpoint = API_KEY
      ? `${API_URL}/api/partner/roles/analyze`
      : `${API_URL}/api/role/analyze`;

    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ jd_text: input.jd_text }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) return localHeuristic(input.jd_text);
    return mapIvyLensResponse(await res.json());
  } catch {
    return localHeuristic(input.jd_text);
  }
}

export function localHeuristic(jdText: string): FrictionScore {
  const text        = jdText.toLowerCase();
  const bulletLines = (jdText.match(/^[\s]*[-•*]\s+.+/gm) ?? []).length;
  const yearsMatch  = (text.match(/\d+\+?\s+years?/g) ?? []).length;
  const skillsCount = bulletLines + yearsMatch;

  const hasResp  = /responsibilit|you will|key duties/.test(text);
  const hasReq   = /requirements|must.have|essential/.test(text);
  const clarityScore  = Math.round((1 - [hasResp, hasReq, text.split(/\s+/).length > 10].filter(Boolean).length / 3) * 100);
  const overloadScore = skillsCount > 15 ? 90 : skillsCount > 10 ? 70 : skillsCount > 5 ? 45 : 20;

  let frictionScore = 30;
  if (/office.only|fully.on.?site/.test(text)) frictionScore += 30;
  if (/london/.test(text) && !/remote|hybrid/.test(text)) frictionScore += 20;
  if (!/salary|£/.test(text)) frictionScore += 15;
  frictionScore = Math.min(frictionScore, 95);

  const overall = Math.round(frictionScore * 0.5 + overloadScore * 0.3 + clarityScore * 0.2);

  return {
    overall_score: overall, overall_level: levelFromScore(overall),
    friction_score: frictionScore, clarity_score: clarityScore,
    overload_score: overloadScore, required_skills_count: skillsCount,
    recommendations: ['Connect IvyLens API for full market-data scoring.'],
    time_to_fill_estimate: timeToFill(overall),
  };
}
