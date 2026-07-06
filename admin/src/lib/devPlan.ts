// ═══════════════════════════════════════════════════════════
// Development Plan — shared content model + helpers.
//
// `content` and `strengths` are stored as JSONB on dev_plans
// (migration 076). Rich-text fields (`*_html`) hold sanitised
// HTML authored via Tiptap and are rendered through
// sanitizeHtml() before dangerouslySetInnerHTML.
//
// Duplicated verbatim in admin/ and portal/ (the two apps don't
// share code — same pattern as frictionLens.ts).
// ═══════════════════════════════════════════════════════════

export type CareerFit = 'strongest' | 'strong' | 'emerging';

export interface DevPlanStrength {
  label: string;
  rating: number; // 0..5
}

export interface FactItem { k: string; v: string }

export interface DevPlanContent {
  cover?: {
    report_kind?: string;   // eyebrow, e.g. "Athlete Transition Report"
    tagline?: string;       // one-line positioning under the name
    date_label?: string;    // e.g. "July 2026"
    location?: string;
    prepared_by?: string;   // e.g. "The People System"
  };
  exec_summary?: { heading?: string; body_html?: string };
  positioning?: string;     // pull-quote callout (HTML)
  profile?: {
    facts?: FactItem[];
    career?: string[];       // professional career bullets
    education_html?: string; // education / footnote
  };
  career_overview?: { heading?: string; body_html?: string; bullets?: string[] };
  findings?: { heading: string; body_html: string }[];
  brand_partnerships?: string[];
  personality?: { label: string; body: string }[];
  career_paths?: { title: string; body: string; fit: CareerFit }[];
  companies?: { category: string; items: string[] }[];
  opportunity?: { heading?: string; body_html?: string; bullets?: string[] };
  assessment?: { body_html?: string };
}

export const FIT_LABEL: Record<CareerFit, string> = {
  strongest: 'Strongest fit',
  strong: 'Strong',
  emerging: 'Emerging',
};

// An empty / newly-created plan has no report body — the document
// renderer falls back to the legacy summary + milestones layout.
export function contentIsEmpty(content: DevPlanContent | null | undefined): boolean {
  if (!content) return true;
  const c = content;
  return !(
    c.exec_summary?.body_html ||
    c.positioning ||
    (c.profile && (c.profile.facts?.length || c.profile.career?.length || c.profile.education_html)) ||
    c.career_overview?.body_html ||
    c.findings?.length ||
    c.brand_partnerships?.length ||
    c.personality?.length ||
    c.career_paths?.length ||
    c.companies?.length ||
    c.opportunity?.body_html ||
    c.assessment?.body_html
  );
}

// Radar geometry: given N strengths (0..5), return the SVG polygon
// point strings for the data shape plus the axis endpoints and ring
// polygons. Pure — safe to call in a server component.
export interface RadarGeometry {
  size: number;
  cx: number;
  cy: number;
  radius: number;
  rings: string[];          // ring polygon point strings (1..MAX)
  spokes: { x: number; y: number }[];
  dataPoints: string;       // the filled data polygon points
  vertices: { x: number; y: number; label: string; rating: number }[];
  labels: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
}

export function radarGeometry(strengths: DevPlanStrength[], size = 330, radius = 118, max = 5): RadarGeometry {
  const cx = size / 2;
  const cy = size / 2;
  const n = Math.max(strengths.length, 3);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) });

  const rings: string[] = [];
  for (let ring = 1; ring <= max; ring++) {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) { const p = at(i, (radius * ring) / max); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
    rings.push(pts.join(' '));
  }

  const spokes = strengths.map((_, i) => at(i, radius));

  const dataPoints = strengths
    .map((s, i) => { const p = at(i, (radius * clamp(s.rating, 0, max)) / max); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
    .join(' ');

  const vertices = strengths.map((s, i) => {
    const p = at(i, (radius * clamp(s.rating, 0, max)) / max);
    return { x: p.x, y: p.y, label: s.label, rating: s.rating };
  });

  const labels = strengths.map((s, i) => {
    const p = at(i, radius + 12);
    const dx = p.x - cx;
    const anchor: 'start' | 'middle' | 'end' = Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end';
    return { x: p.x, y: p.y, text: s.label, anchor };
  });

  return { size, cx, cy, radius, rings, spokes, dataPoints, vertices, labels };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
}
