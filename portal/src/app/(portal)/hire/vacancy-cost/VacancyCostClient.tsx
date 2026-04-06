'use client';
import { useMemo } from 'react';
import { AlertTriangle, Clock, TrendingDown, PoundSterling, Briefcase } from 'lucide-react';

/* ─── Vacancy cost model ──────────────────────────────────────────────
   This calculates the REVENUE LOSS to the business from an empty seat.
   An employee typically generates 2–4× their salary in revenue/output.
   When a role sits vacant, the business loses that revenue AND incurs
   hidden costs: overtime, contractor cover, missed targets, churn.

   Revenue multiplier = base (2.5x) + friction adjustment (0–1.5x).
   Higher friction = harder to fill = role likely more specialised =
   higher revenue impact. The friction_score (0–100) from Friction
   Lens is used directly for a continuous scale rather than buckets.

   Sources: Oxford Economics, CIPD Cost of Vacancy research, Cebr.
   ──────────────────────────────────────────────────────────────────── */

const BASE_REVENUE_MULTIPLIER = 2.5; // minimum: an employee generates 2.5× salary in value
const MAX_FRICTION_BONUS = 1.5;      // up to 1.5× extra for high-friction roles (total: 4×)

function getMultiplier(frictionScore: any, frictionLevel: string | null): number {
  // If we have a numeric friction score from the Lens, use it for a smooth curve
  const score = typeof frictionScore === 'object' ? frictionScore?.overall_score : Number(frictionScore);
  if (score && !isNaN(score)) {
    return Math.round((BASE_REVENUE_MULTIPLIER + (score / 100) * MAX_FRICTION_BONUS) * 10) / 10;
  }
  // Fallback to level buckets
  const fallback: Record<string, number> = { Low: 2.5, Medium: 3.0, High: 3.5, Critical: 4.0 };
  return fallback[frictionLevel ?? 'Medium'] ?? 3.0;
}

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
  const multiplier = getMultiplier(role.friction_score, role.friction_level);
  const dailyRevenueLoss = Math.round((salary / 260) * multiplier);
  const totalRevenueLoss = dailyRevenueLoss * days;
  // Hidden costs: overtime for covering team, agency/temp cover, lost clients
  const hiddenCosts = Math.round(totalRevenueLoss * 0.15);
  const totalCost = totalRevenueLoss + hiddenCosts;
  return { salary, days, level, multiplier, dailyRevenueLoss, totalRevenueLoss, hiddenCosts, totalCost };
}

export default function VacancyCostClient({ roles }: { roles: Role[] }) {
  const analysis = useMemo(() => roles.map(r => ({
    ...r,
    ...calcRoleCost(r),
  })), [roles]);

  const grandRevenueLoss = analysis.reduce((s, r) => s + r.totalRevenueLoss, 0);
  const grandHiddenCosts = analysis.reduce((s, r) => s + r.hiddenCosts, 0);
  const grandTotal = grandRevenueLoss + grandHiddenCosts;
  const totalDaily = analysis.reduce((s, r) => s + r.dailyRevenueLoss, 0);
  const totalWeekly = totalDaily * 7;
  const totalMonthly = totalDaily * 30;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Cost of an Empty Seat</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Estimated revenue loss from unfilled roles — powered by your Friction Lens data
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg p-3 mb-5" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--purple)' }}>Estimate only.</strong> An employee typically generates 2.5–4× their salary in revenue and output. When a seat is empty, that value is lost — plus hidden costs like overtime, contractor cover, and missed targets. Multipliers are adjusted by your Friction Lens score (higher friction = more specialised role = greater revenue impact). Based on Oxford Economics and CIPD research. Actual figures vary by business model.
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
                  Estimated Revenue Lost ({roles.length} empty seat{roles.length !== 1 ? 's' : ''})
                </p>
                <p className="font-display font-bold text-2xl text-gradient">
                  {fmt(grandTotal)}
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your {roles.length} empty seat{roles.length !== 1 ? 's are' : ' is'} losing an estimated <strong style={{ color: 'var(--danger)' }}>{fmt(totalDaily)}/day</strong> in revenue, output and hidden costs.
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
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Daily Loss</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Revenue Lost</th>
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
                        {fmt(r.dailyRevenueLoss)}/d
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
              Daily revenue loss = (salary ÷ 260 working days) × revenue multiplier. An employee generates 2.5–4× their salary in value — when that seat is empty, the business loses that output. Your Friction Lens score adjusts the multiplier: higher-friction roles are more specialised, harder to backfill, and cost more per day vacant. Hidden costs (overtime, temp cover, missed targets) add ~15% on top.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: 'Low friction', range: '2.5×' },
                { label: 'Medium friction', range: '3.0×' },
                { label: 'High friction', range: '3.5×' },
                { label: 'Critical friction', range: '4.0×' },
              ].map(item => (
                <span key={item.label} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
                  {item.label}: {item.range} salary in revenue
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
