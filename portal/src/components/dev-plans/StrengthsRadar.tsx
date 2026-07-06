import { radarGeometry, type DevPlanStrength } from '@/lib/devPlan';

// Print-safe strengths radar. Pure SVG computed at render time — no
// client JS, no charting dependency — so it survives Save-as-PDF.
// A2I gold-on-navy palette.
export default function StrengthsRadar({
  strengths,
  size = 330,
  max = 5,
}: {
  strengths: DevPlanStrength[];
  size?: number;
  max?: number;
}) {
  const list = (strengths ?? []).filter(s => s.label?.trim());
  if (list.length < 3) return null;

  const g = radarGeometry(list, size, size / 2 - 47, max);
  const GOLD = '#c9a24a';
  const GOLD_BRIGHT = '#e0b85a';
  const NAVY = '#0a1126';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Strengths radar chart"
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      {/* rings */}
      {g.rings.map((pts, i) => (
        <polygon key={`ring-${i}`} points={pts} fill="none" stroke="rgba(7,11,29,0.10)" strokeWidth={1} />
      ))}
      {/* spokes */}
      {g.spokes.map((p, i) => (
        <line key={`spoke-${i}`} x1={g.cx} y1={g.cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="rgba(7,11,29,0.08)" strokeWidth={1} />
      ))}
      {/* data polygon */}
      <polygon points={g.dataPoints} fill="rgba(201,162,74,0.22)" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" />
      {/* vertices */}
      {g.vertices.map((v, i) => (
        <circle key={`v-${i}`} cx={v.x.toFixed(1)} cy={v.y.toFixed(1)} r={3} fill={NAVY} stroke={GOLD_BRIGHT} strokeWidth={1.5} />
      ))}
      {/* axis labels */}
      {g.labels.map((l, i) => (
        <text
          key={`l-${i}`}
          x={l.x.toFixed(1)}
          y={l.y.toFixed(1)}
          textAnchor={l.anchor}
          dominantBaseline="middle"
          fontSize={8.5}
          fontWeight={600}
          fill="#38436a"
        >
          {l.text.length > 18 ? l.text.slice(0, 17) + '…' : l.text}
        </text>
      ))}
    </svg>
  );
}
