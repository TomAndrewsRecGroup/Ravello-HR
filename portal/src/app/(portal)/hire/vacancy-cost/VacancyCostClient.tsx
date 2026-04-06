'use client';
import { useMemo } from 'react';
import { AlertTriangle, Clock, TrendingDown, PoundSterling, Briefcase } from 'lucide-react';

/* ─── Vacancy cost model ──────────────────────────────────────────────
   Daily cost = midpoint salary ÷ 260 working days × multiplier.
   The multiplier accounts for lost output beyond just salary:
   revenue impact, team burden, overtime, delayed projects.
   Conservative 2–3× range based on Oxford Economics / CIPD research.
   Friction level adjusts the multiplier (harder-to-fill = more pain).
   ──────────────────────────────────────────────────────────────────── */

const FRICTION_MULTIPLIER: Record<string, number> = {
  Low:      2.0,
  Medium:   2.5,
  High:     3.0,
  Critical: 3.5,
};

function parseSalary(range: string | null): number {
  if (!range) return 35000;
  const nums = range.match(/[\d,]+/g)?.map(s => parseInt(s.replace(/,/g, ''), 10)) ?? [];
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  if (nums.length === 1) return nums[0];
  return 35000;
}

function daysOpen(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

interface Role {
  id: string;
  title: string;
  department: string | null;
  salary_range: string | null;
  created_at: string;
  stage: string;
  friction_score: any;
  friction_level: string | null;
  location: string | null;
  seniority: string | null;
}

function calcRoleCost(role: Role) {
  const salary = parseSalary(role.salary_range);
  const days = daysOpen(role.created_at);
  const level = role.friction_level ?? 'Medium';
  const multiplier = FRICTION_MULTIPLIER[level] ?? 2.5;
  const dailyCost = Math.round((salary / 260) * multiplier);
  const totalCost = dailyCost * days;
  return { salary, days, level, multiplier, dailyCost, totalCost };
}

export default function VacancyCostClient({ roles }: { roles: Role[] }) {
  const analysis = useMemo(() => roles.map(r => ({
    ...r,
    ...calcRoleCost(r),
  })), [roles]);

  const grandTotal = analysis.reduce((s, r) => s + r.totalCost, 0);
  const totalDaily = analysis.reduce((s, r) => s + r.dailyCost, 0);
  const totalWeekly = totalDaily * 7;
  const totalMonthly = totalDaily * 30;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Vacancy Cost Calculator</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Estimated cost of your open roles based on salary and friction data
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg p-3 mb-5" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--purple)' }}>Estimate only.</strong> Daily vacancy cost is derived from the role salary and a friction-adjusted multiplier (2–3.5x daily salary) reflecting lost productivity, team burden, and revenue impact. Based on industry benchmarks from Oxford Economics and CIPD. Actual costs vary by business model and team structure.
        </p>
      </div>

      {roles.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="empty-state">
            <Briefcase size={28} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No open roles</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
              Raise a role under the Hiring tab to see vacancy cost estimates here automatically.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Impact headline */}
          <div className="card p-6 mb-5" style={{ background: 'var(--gradient-soft)', border: '1px solid rgba(124,58,237,0.12)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(217,68,68,0.1)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--danger)' }}>
                  Total Vacancy Cost ({roles.length} open role{roles.length !== 1 ? 's' : ''})
                </p>
                <p className="font-display font-bold text-2xl text-gradient">
                  {fmt(grandTotal)}
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your {roles.length} unfilled role{roles.length !== 1 ? 's are' : ' is'} costing an estimated <strong style={{ color: 'var(--danger)' }}>{fmt(totalDaily)}/day</strong> in lost productivity and revenue.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} style={{ color: 'var(--ink-faint)' }} />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Daily Burn</p>
              </div>
              <p className="font-display font-bold text-xl" style={{ color: 'var(--danger)' }}>{fmt(totalDaily)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={14} style={{ color: 'var(--ink-faint)' }} />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Weekly Burn</p>
              </div>
              <p className="font-display font-bold text-xl" style={{ color: '#D97706' }}>{fmt(totalWeekly)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <PoundSterling size={14} style={{ color: 'var(--ink-faint)' }} />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Monthly Burn</p>
              </div>
              <p className="font-display font-bold text-xl" style={{ color: 'var(--blue)' }}>{fmt(totalMonthly)}</p>
            </div>
          </div>

          {/* Per-role breakdown */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3" style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--line)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Per-Role Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Role</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Salary</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Days Open</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Friction</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Daily Cost</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{r.title}</p>
                        {r.department && <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs hide-mobile" style={{ color: 'var(--ink-soft)' }}>
                        {fmt(r.salary)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            background: r.days > 30 ? 'rgba(217,68,68,0.08)' : r.days > 14 ? 'rgba(245,158,11,0.12)' : 'rgba(52,211,153,0.12)',
                            color: r.days > 30 ? '#B02020' : r.days > 14 ? '#8A5500' : '#047857',
                          }}
                        >
                          {r.days}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center hide-mobile">
                        <span
                          className="badge"
                          style={{
                            background: r.level === 'Critical' ? 'rgba(127,17,17,0.14)' :
                                        r.level === 'High' ? 'rgba(217,68,68,0.10)' :
                                        r.level === 'Medium' ? 'rgba(245,158,11,0.12)' :
                                        'rgba(52,211,153,0.14)',
                            color: r.level === 'Critical' ? '#7F1111' :
                                   r.level === 'High' ? '#B02020' :
                                   r.level === 'Medium' ? '#8A5500' : '#047857',
                          }}
                        >
                          {r.level} ({r.multiplier}x)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium hide-mobile" style={{ color: 'var(--ink-soft)' }}>
                        {fmt(r.dailyCost)}/d
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--danger)' }}>
                        {fmt(r.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-soft)' }}>
                    <td colSpan={5} className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>Total</td>
                    <td className="px-4 py-3 text-right text-base font-bold text-gradient">{fmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--surface-soft)' }}>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--ink-soft)' }}>How it works</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
              Daily cost = (salary ÷ 260 working days) × friction multiplier. The multiplier reflects total business impact beyond just salary — lost revenue, team overload, overtime, delayed projects. Higher friction roles (harder to fill) carry a higher multiplier because the vacancy impact compounds faster.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(FRICTION_MULTIPLIER).map(([level, mult]) => (
                <span key={level} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
                  {level}: {mult}x daily salary
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
