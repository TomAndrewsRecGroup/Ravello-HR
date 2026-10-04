// Native, dependency-free chart primitives for Core OS 360's own
// "intelligence" and reporting pages — built ONLY from the platform's
// own CSS custom properties (--purple/--teal/--gold/--red/--ink/
// --ink-faint/--line/--surface, the .card/.badge conventions) and the
// app's own `.font-display` stack (Inter — see tailwind.config.ts;
// the CLAUDE.md design-system note naming Plus Jakarta Sans predates
// the 2026-09-24 Core OS 360 rebrand and is stale), never a generic
// chart-library default theme. Server-renderable — no 'use client',
// no state, pure SVG + HTML built from already-computed data the
// caller supplies.
//
// A shared-dupe pair (admin + portal, byte-identical, mirrored by
// scripts/check-shared-dupes.sh) — the same "one native component,
// not two that could drift" discipline every other hs/ shared view
// component in this codebase already follows.
//
// Lines are smoothed with a Catmull-Rom-to-cubic-Bezier spline
// (tension 1/6) rather than left as jagged polylines — the one fix
// this codebase's own dataviz work already learned mattered most for
// a "professional, not default-chart-library" feel. There is no text
// baked into any <svg> here (every label is ordinary HTML next to
// it), so none of this needs the earlier real-pixel-viewBox fix that
// mattered for a standalone, resizeable artifact — a fixed
// width/height here never risks illegible scaled text.

export type Band = 'ok' | 'attention' | 'critical';

const BAND_VAR: Record<Band, string> = {
  ok: 'var(--teal)',
  attention: 'var(--gold)',
  critical: 'var(--red)',
};

/** Catmull-Rom -> cubic Bezier, tension 1/6 (the standard smooth-line constant). */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  if (points.length === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * A small filled trend line — the "sparkline with substance" used
 * throughout the intelligence pages. Values map top (max) to bottom
 * (0); a flat/empty series renders a flat midline rather than
 * nothing, so an empty-but-present chart never looks like a broken
 * one. `colour` defaults to the brand accent; pass a band colour
 * (BAND_VAR[...]) to recolour by severity.
 */
export function TrendArea({
  values, width = 320, height = 72, colour = 'var(--purple)', fillId,
}: {
  values: number[];
  width?: number;
  height?: number;
  colour?: string;
  /** A stable, unique id for this chart's gradient defs — required
      whenever more than one TrendArea renders on the same page, since
      SVG <defs> ids are global to the document. */
  fillId: string;
}) {
  const pad = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const n = values.length;
  const points: [number, number][] = n <= 1
    ? [[pad, height / 2], [width - pad, height / 2]]
    : values.map((v, i) => [
        pad + (i / (n - 1)) * (width - pad * 2),
        pad + (1 - (v - min) / range) * (height - pad * 2),
      ]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${points[points.length - 1][0]},${height} L${points[0][0]},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A tiny inline trend line for a stat tile — no fill, just the line. */
export function Sparkline({
  values, width = 72, height = 24, colour = 'var(--purple)',
}: {
  values: number[];
  width?: number;
  height?: number;
  colour?: string;
}) {
  const pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const n = values.length;
  const points: [number, number][] = n <= 1
    ? [[pad, height / 2], [width - pad, height / 2]]
    : values.map((v, i) => [
        pad + (i / (n - 1)) * (width - pad * 2),
        pad + (1 - (v - min) / range) * (height - pad * 2),
      ]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      <path d={smoothPath(points)} fill="none" stroke={colour} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A multi-segment ring — one arc per item, coloured by band — for a
 * "shape of the portfolio" view (e.g. Core 360 Status's six domains).
 * The centre always carries a real text readout (never colour alone,
 * per the platform's own accessibility rule), and a visible legend
 * sits beside/below it — colour is reinforcement, never the only
 * signal.
 */
export function BandRing({
  segments, size = 96, strokeWidth = 12, centreLabel, centreSub,
}: {
  /** Either a known `Band` (resolved via BAND_VAR) or a raw CSS colour
      string/token — callers with their own band vocabulary (more than
      3 values, e.g. Compliance Twin's red/amber/green/unverified) pass
      `colour` directly rather than forcing their type onto `Band`. */
  segments: ({ band: Band } | { colour: string })[];
  size?: number;
  strokeWidth?: number;
  centreLabel: string;
  centreSub?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const n = Math.max(segments.length, 1);
  const gap = 3; // degrees of gap between segments
  const sweep = 360 / n - gap;
  let angle = -90; // start at 12 o'clock

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const start = angle;
          angle += sweep + gap;
          const dash = (sweep / 360) * circumference;
          const offset = -(start + 90) / 360 * circumference;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={'band' in seg ? BAND_VAR[seg.band] : seg.colour}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <text x={cx} y={cy - (centreSub ? 4 : -2)} textAnchor="middle" fontSize={size * 0.17} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-inter, 'Inter'), sans-serif">
          {centreLabel}
        </text>
        {centreSub && (
          <text x={cx} y={cy + size * 0.16} textAnchor="middle" fontSize={size * 0.09} fill="var(--ink-faint)">
            {centreSub}
          </text>
        )}
      </svg>
    </div>
  );
}

/** A horizontal bar row for comparing a few named values at a glance. */
export function MiniBarRow({
  label, value, max, colour = 'var(--purple)', display,
}: {
  label: string;
  value: number;
  max: number;
  colour?: string;
  /** Override the right-hand numeric readout (defaults to `value`). */
  display?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs flex-shrink-0 w-28 truncate" style={{ color: 'var(--ink-soft)' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--surface-soft)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colour, borderRadius: 99, transition: 'width 0.3s ease-out' }} />
      </div>
      <span className="text-xs font-semibold flex-shrink-0 w-8 text-right" style={{ color: 'var(--ink)' }}>{display ?? value}</span>
    </div>
  );
}

/**
 * A single rounded bar split into segments, each segment's WIDTH
 * proportional to its own share of the total — the honest shape for
 * "N of M done, the rest outstanding", never BandRing's equally-sized
 * arcs (BandRing is for N categorical items, not a proportion of one
 * whole). A zero-total series renders an empty, unfilled track rather
 * than guessing a 100% segment.
 */
export function ProportionBar({
  segments, height = 10,
}: {
  segments: { value: number; colour: string; label: string }[];
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex rounded-full overflow-hidden" style={{ height, background: 'var(--surface-soft)' }}>
        {total > 0 && segments.map((s, i) => (
          s.value > 0 && (
            <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.colour, height: '100%' }} title={`${s.label}: ${s.value}`} />
          )
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {segments.map((s, i) => (
          <span key={i} className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: s.colour, flexShrink: 0, display: 'inline-block' }} />
            {s.label}: <strong style={{ color: 'var(--ink)' }}>{s.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A side-by-side pair of bars for a period-over-period comparison. */
export function CompareBars({
  currentLabel, currentValue, priorLabel, priorValue, max, colour = 'var(--purple)',
}: {
  currentLabel: string;
  currentValue: number;
  priorLabel: string;
  priorValue: number;
  max?: number;
  colour?: string;
}) {
  const m = max ?? Math.max(currentValue, priorValue, 1);
  return (
    <div className="space-y-2">
      <MiniBarRow label={priorLabel} value={priorValue} max={m} colour="var(--ink-faint)" />
      <MiniBarRow label={currentLabel} value={currentValue} max={m} colour={colour} />
    </div>
  );
}

export { BAND_VAR };
