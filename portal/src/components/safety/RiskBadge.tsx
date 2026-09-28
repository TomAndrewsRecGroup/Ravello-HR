import { levelColour } from '@/lib/hs/riskMatrix';
import { RISK_LEVEL_LABELS, type RiskLevel } from '@/lib/hs/safetyVocab';

// Score + band. The band comes from the assessment's own matrix; the
// score is the database's generated column, never recomputed here.
export default function RiskBadge({ score, level, label }: { score: number | null | undefined; level: RiskLevel | null | undefined; label?: string | null }) {
  if (score == null) return <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>—</span>;
  const c = levelColour(level);
  return (
    <span className="badge whitespace-nowrap" style={{ background: 'var(--surface-soft)', color: c, border: `1px solid ${c}` }}>
      {score} · {label ?? (level ? RISK_LEVEL_LABELS[level] : 'Unbanded')}
    </span>
  );
}
