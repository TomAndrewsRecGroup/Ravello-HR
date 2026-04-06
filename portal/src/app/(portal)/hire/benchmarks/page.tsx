import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { PoundSterling, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

export const metadata: Metadata = { title: 'Salary Benchmarks' };

function fmtK(n: number | null): string {
  if (n == null) return '—';
  return `£${Math.round(n / 1000)}k`;
}

function positionLabel(salary: number, p25: number | null, p50: number | null, p75: number | null): {
  label: string; color: string; bg: string; Icon: React.ElementType;
} {
  if (!p25 || !p50 || !p75) return { label: 'No data', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', Icon: Minus };
  if (salary < p25)  return { label: 'Below market', color: '#991B1B', bg: 'rgba(220,38,38,0.1)',   Icon: TrendingDown };
  if (salary < p50)  return { label: 'Lower quartile', color: '#92400E', bg: 'rgba(217,119,6,0.1)', Icon: TrendingDown };
  if (salary <= p75) return { label: 'Market rate',   color: '#166534', bg: 'rgba(22,163,74,0.1)',  Icon: TrendingUp  };
  return               { label: 'Above market',  color: '#1E40AF', bg: 'rgba(59,111,255,0.1)',  Icon: TrendingUp  };
}

export default async function BenchmarksPage() {
  const supabase = createServerSupabaseClient();
  const { companyId: cId } = await getSessionProfile();
  const companyId: string = cId ?? '';

  const [{ data: reqs }, { data: benchmarks }] = await Promise.all([
    supabase
      .from('requisitions')
      .select('id, title, seniority, location, working_model, salary_min, salary_max')
      .eq('company_id', companyId)
      .not('salary_min', 'is', null)
      .not('salary_max', 'is', null)
      .not('stage', 'in', '("filled","cancelled")')
      .order('created_at', { ascending: false }),
    supabase
      .from('salary_benchmarks')
      .select('*')
      .order('role_type'),
  ]);

  const activeReqs = reqs ?? [];
  const allBenchmarks = benchmarks ?? [];

  // Match each req to the best benchmark
  function findBenchmark(req: any) {
    const loc   = (req.location ?? '').toLowerCase();
    const sen   = (req.seniority ?? '').toLowerCase();
    const model = (req.working_model ?? '').toLowerCase();
    const title = (req.title ?? '').toLowerCase();

    // Score each benchmark by specificity match
    let best: any = null;
    let bestScore = -1;

    for (const b of allBenchmarks) {
      const bRole  = b.role_type.toLowerCase();
      const bLoc   = (b.location ?? '').toLowerCase();
      const bSen   = (b.seniority ?? '').toLowerCase();
      const bModel = (b.working_model ?? '').toLowerCase();

      // Must loosely match role type (substring match)
      if (!title.includes(bRole) && !bRole.split(' ').some((w: string) => title.includes(w))) continue;

      let score = 1;
      if (bLoc   && loc.includes(bLoc))   score += 3;
      if (bSen   && sen.includes(bSen))   score += 2;
      if (bModel && model === bModel)     score += 1;

      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  const comparisons = activeReqs.map((req: any) => {
    const mid       = Math.round(((req.salary_min ?? 0) + (req.salary_max ?? 0)) / 2);
    const benchmark = findBenchmark(req);
    const pos       = benchmark && mid > 0
      ? positionLabel(mid, benchmark.salary_p25, benchmark.salary_p50, benchmark.salary_p75)
      : { label: 'No benchmark', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', Icon: Info };
    return { req, benchmark, mid, pos };
  });

  // Stats
  const matched    = comparisons.filter(c => c.benchmark);
  const aboveCount = matched.filter(c => c.pos.label === 'Above market').length;
  const atCount    = matched.filter(c => c.pos.label === 'Market rate').length;
  const belowCount = matched.filter(c => c.pos.label.includes('Lower') || c.pos.label === 'Below market').length;

  return (
      <main className="portal-page flex-1 space-y-6">

        {/* Summary cards */}
        {matched.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: 'Above Market',  value: aboveCount,  color: '#1E40AF', bg: 'rgba(59,111,255,0.08)' },
              { label: 'Market Rate',   value: atCount,     color: '#166534', bg: 'rgba(22,163,74,0.08)'  },
              { label: 'Below Market',  value: belowCount,  color: '#991B1B', bg: 'rgba(220,38,38,0.08)'  },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-[12px] p-5" style={{ background: bg }}>
                <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Comparisons */}
        {activeReqs.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <PoundSterling size={24} />
              <p className="text-sm">No active roles with salary data</p>
              <p className="text-xs max-w-[300px]">Raise a role with a salary range to see how it compares to market benchmarks.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {comparisons.map(({ req, benchmark, mid, pos }) => {
              const PosIcon = pos.Icon;
              const p25 = benchmark?.salary_p25;
              const p50 = benchmark?.salary_p50;
              const p75 = benchmark?.salary_p75;
              const p90 = benchmark?.salary_p90;

              // Calculate position on bar (0-100%)
              const low  = p25 ?? 20000;
              const high = p90 ?? (low * 2);
              const range = high - low;
              const pct  = range > 0 ? Math.max(0, Math.min(100, ((mid - low) / range) * 100)) : 50;

              return (
                <div key={req.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{req.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                        {[req.seniority, req.location, req.working_model].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: pos.bg, color: pos.color }}>
                      <PosIcon size={12} /> {pos.label}
                    </span>
                  </div>

                  {/* Salary range display */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Your range:</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {fmtK(req.salary_min)} – {fmtK(req.salary_max)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>(mid: {fmtK(mid)})</span>
                  </div>

                  {benchmark ? (
                    <>
                      {/* Benchmark bar */}
                      <div className="relative mb-2">
                        <div className="h-3 rounded-full relative" style={{ background: 'var(--surface-alt)' }}>
                          {/* p25–p75 zone (market range) */}
                          {p25 && p75 && (
                            <div
                              className="absolute h-full rounded-full"
                              style={{
                                left: `${Math.max(0, ((p25 - low) / range) * 100)}%`,
                                width: `${Math.max(0, ((p75 - p25) / range) * 100)}%`,
                                background: 'rgba(22,163,74,0.2)',
                              }}
                            />
                          )}
                          {/* Your salary marker */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 rounded-full"
                            style={{ left: `${pct}%`, background: pos.color }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                          <span>P25 {fmtK(p25)}</span>
                          <span>Median {fmtK(p50)}</span>
                          <span>P75 {fmtK(p75)}</span>
                          {p90 && <span>P90 {fmtK(p90)}</span>}
                        </div>
                      </div>
                      {benchmark.source && (
                        <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                          Source: {benchmark.source}
                          {benchmark.effective_date && ` (${new Date(benchmark.effective_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })})`}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                      No benchmark data available for this role type. Contact your consultant at The People Office for a market rate analysis.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
  );
}
