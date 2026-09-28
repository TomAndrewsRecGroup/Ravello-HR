import { levelColour, riskBand, type RiskMatrix } from '@/lib/hs/riskMatrix';

// The assessment's own L × S matrix with every risk item placed twice:
// once at its INITIAL rating (outlined) and once at its RESIDUAL rating
// (filled). Likelihood runs bottom to top, severity left to right — the
// conventional layout — and each cell carries its band's colour.
export default function RiskMatrixGrid({ matrix, items }: {
  matrix: RiskMatrix;
  items: { n: number; lb: number; sb: number; la: number | null; sa: number | null }[];
}) {
  const L = matrix.likelihood_labels.length;
  const S = matrix.severity_labels.length;
  const rows = Array.from({ length: L }, (_, i) => L - i);
  const cols = Array.from({ length: S }, (_, i) => i + 1);
  return (
    <div className="space-y-2 print-keep-color">
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
          <tbody>
            {rows.map(l => (
              <tr key={l}>
                <th className="text-right pr-2 font-normal whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{l} · {matrix.likelihood_labels[l - 1]}</th>
                {cols.map(s => {
                  const band = riskBand(matrix, l * s);
                  const c = levelColour(band?.level);
                  const initial = items.filter(i => i.lb === l && i.sb === s);
                  const residual = items.filter(i => i.la === l && i.sa === s);
                  return (
                    <td key={s} title={`${band?.label ?? ''} (${l * s})`}
                      style={{ width: 64, height: 48, verticalAlign: 'top', padding: 4, borderRadius: 6,
                        background: `color-mix(in srgb, ${c} 16%, var(--surface))`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)` }}>
                      <div className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{l * s}</div>
                      <div className="flex flex-wrap gap-0.5">
                        {initial.map(i => (
                          <span key={`i${i.n}`} className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
                            style={{ width: 18, height: 18, border: `1.5px solid ${c}`, color: 'var(--ink)', background: 'var(--surface)' }}
                            title={`Hazard ${i.n}: initial`}>{i.n}</span>
                        ))}
                        {residual.map(i => (
                          <span key={`r${i.n}`} className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
                            style={{ width: 18, height: 18, background: c, color: 'var(--surface)' }}
                            title={`Hazard ${i.n}: residual`}>{i.n}</span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th />
              {cols.map(s => (
                <th key={s} className="font-normal pt-1 align-top" style={{ color: 'var(--ink-soft)', maxWidth: 64 }}>{s}<br />{matrix.severity_labels[s - 1]}</th>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--ink-faint)' }}>
        <span>Rows: likelihood · Columns: severity</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block rounded-full" style={{ width: 12, height: 12, border: '1.5px solid var(--ink-soft)' }} /> Initial risk</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block rounded-full" style={{ width: 12, height: 12, background: 'var(--ink-soft)' }} /> Residual risk</span>
        {matrix.bands.map(b => (
          <span key={b.min} className="inline-flex items-center gap-1">
            <span className="inline-block rounded" style={{ width: 12, height: 12, background: levelColour(b.level) }} /> {b.label} ({b.min}–{b.max})
          </span>
        ))}
      </p>
    </div>
  );
}
