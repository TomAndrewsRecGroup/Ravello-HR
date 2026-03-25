// ─── Friction Lens API Client ─────────────────────────────────────────────────
// Calls the IvyLens Rust API to score a role against live market data.
// If the API is unavailable, returns a graceful fallback.

import type { FrictionScore, FrictionLevel } from '@/lib/supabase/types';

export interface RoleInput {
  title:            string;
  location:         string;
  salary_min:       number;
  salary_max:       number;
  skills:           string[];
  working_model:    'office' | 'hybrid' | 'remote';
  interview_stages: number;
  sector?:          string;
}

// Re-export so consumers don't need to import from types
export type { FrictionScore, FrictionLevel };

const API_URL = process.env.NEXT_PUBLIC_IVYLENS_API_URL ?? '';

function fallbackScore(message?: string): FrictionScore {
  const dim = { score: 0, label: 'Unknown' as FrictionLevel, explanation: message ?? 'Score unavailable' };
  return {
    overall_level:       'Unknown',
    overall_score:       0,
    dimensions: {
      location:      dim,
      salary:        dim,
      skills:        dim,
      working_model: dim,
      process:       dim,
    },
    recommendations:       message ? [message] : ['Friction Lens scoring is not available right now.'],
    time_to_fill_estimate: 'Unknown',
  };
}

export async function scoreFriction(roleData: RoleInput): Promise<FrictionScore> {
  if (!API_URL) {
    // No API configured — run a simple local heuristic instead
    return localHeuristic(roleData);
  }

  try {
    const res = await fetch(`${API_URL}/api/role/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(roleData),
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn('[FrictionLens] API returned', res.status);
      return localHeuristic(roleData);
    }

    return (await res.json()) as FrictionScore;
  } catch (err) {
    console.warn('[FrictionLens] API unavailable, using local heuristic:', err);
    return localHeuristic(roleData);
  }
}

// ─── Local heuristic fallback ─────────────────────────────────────────────────
// When the IvyLens API is not reachable, produce a reasonable score
// based on the role inputs. This keeps the portal functional.

function levelFromScore(score: number): FrictionLevel {
  if (score < 25) return 'Low';
  if (score < 50) return 'Medium';
  if (score < 75) return 'High';
  return 'Critical';
}

function localHeuristic(role: RoleInput): FrictionScore {
  let locationScore     = 20;
  let salaryScore       = 20;
  let skillsScore       = 20;
  let workingModelScore = 20;
  let processScore      = 20;

  const recommendations: string[] = [];

  // Location
  const loc = role.location.toLowerCase();
  if (loc.includes('london') && !loc.includes('remote') && !loc.includes('hybrid')) {
    locationScore = 45;
    recommendations.push('London office-only roles face strong competition for candidate attention. Consider stating hybrid flexibility.');
  } else if (loc.includes('remote')) {
    locationScore = 10;
  } else if (loc.includes('hybrid')) {
    locationScore = 18;
  }

  // Salary
  const salaryMid = (role.salary_min + role.salary_max) / 2;
  const spread    = role.salary_max - role.salary_min;
  if (spread < salaryMid * 0.1) {
    salaryScore = 55;
    recommendations.push('Salary range is very narrow. A broader band (15–20%) signals flexibility and attracts more candidates.');
  } else if (role.salary_min === 0 && role.salary_max === 0) {
    salaryScore = 60;
    recommendations.push('No salary range entered. Roles without salary information receive 50–60% fewer applicants.');
  }

  // Skills
  const mustHaveCount = role.skills.length;
  if (mustHaveCount > 6) {
    skillsScore = 65;
    recommendations.push(`${mustHaveCount} must-haves is high. Review which are genuine requirements vs. preferences. Aim for ≤5.`);
  } else if (mustHaveCount > 4) {
    skillsScore = 40;
    recommendations.push('Consider moving 1–2 of your must-haves to nice-to-haves to broaden the candidate pool.');
  }

  // Working model
  if (role.working_model === 'office') {
    workingModelScore = 50;
    recommendations.push('Full office requirement is above market norm for most roles. State clearly if flexibility exists.');
  } else if (role.working_model === 'hybrid') {
    workingModelScore = 15;
  } else {
    workingModelScore = 5;
  }

  // Process
  if (role.interview_stages > 4) {
    processScore = 65;
    recommendations.push(`${role.interview_stages} interview stages is above market norm (2–3). Reduce stages or combine steps to reduce candidate drop-off.`);
  } else if (role.interview_stages > 3) {
    processScore = 40;
    recommendations.push('Consider whether all interview stages are necessary. Streamlined processes win strong candidates.');
  }

  const overall = Math.round((locationScore + salaryScore + skillsScore + workingModelScore + processScore) / 5);

  return {
    overall_level: levelFromScore(overall),
    overall_score: overall,
    dimensions: {
      location:      { score: locationScore,     label: levelFromScore(locationScore),     explanation: 'Based on location and working model combination.' },
      salary:        { score: salaryScore,        label: levelFromScore(salaryScore),        explanation: 'Based on salary range width and completeness.' },
      skills:        { score: skillsScore,        label: levelFromScore(skillsScore),        explanation: 'Based on number and specificity of must-have skills.' },
      working_model: { score: workingModelScore,  label: levelFromScore(workingModelScore),  explanation: 'Based on working model vs. market norm for this role type.' },
      process:       { score: processScore,       label: levelFromScore(processScore),       explanation: 'Based on interview stage count vs. market norm.' },
    },
    recommendations: recommendations.length > 0
      ? recommendations
      : ['Role looks well-positioned. Proceed to market with confidence.'],
    time_to_fill_estimate: overall < 25 ? '3–5 weeks' : overall < 50 ? '5–8 weeks' : overall < 75 ? '8–12 weeks' : '12+ weeks',
  };
}
