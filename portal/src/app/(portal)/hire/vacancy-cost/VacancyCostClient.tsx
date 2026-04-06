'use client';
import { useState, useMemo } from 'react';
import { AlertTriangle, Clock, TrendingDown, PoundSterling, Info } from 'lucide-react';

/* ─── Sector × Role Category revenue-impact data ──────────────────────
   Values are estimated daily revenue/productivity loss to the employer
   when the role sits vacant. Sources: Oxford Economics, CIPD, Cebr,
   LinkedIn Economic Graph — averaged and simplified for SME context.
   These are ILLUSTRATIVE and clearly marked as estimates.
   ──────────────────────────────────────────────────────────────────── */

interface SectorConfig {
  label: string;
  roles: { key: string; label: string; dailyLoss: number; rationale: string }[];
}

const SECTORS: Record<string, SectorConfig> = {
  technology: {
    label: 'Technology',
    roles: [
      { key: 'engineering',     label: 'Software Engineering',    dailyLoss: 1200, rationale: 'Lost sprint velocity, delayed releases, team bottlenecks' },
      { key: 'sales',           label: 'Sales / BDM',            dailyLoss: 1500, rationale: 'Missed pipeline, lost deals, revenue leakage' },
      { key: 'product',         label: 'Product / Design',       dailyLoss: 900,  rationale: 'Roadmap delays, slower iteration cycles' },
      { key: 'data',            label: 'Data / Analytics',       dailyLoss: 800,  rationale: 'Delayed insights, slower decision-making' },
      { key: 'support',         label: 'Customer Support',       dailyLoss: 600,  rationale: 'Longer response times, churn risk' },
      { key: 'marketing',       label: 'Marketing',              dailyLoss: 700,  rationale: 'Reduced lead gen, brand visibility gaps' },
      { key: 'management',      label: 'Management / Leadership',dailyLoss: 1800, rationale: 'Strategic drift, team attrition, decision paralysis' },
      { key: 'operations',      label: 'Operations / Admin',     dailyLoss: 500,  rationale: 'Process slowdowns, increased burden on team' },
    ],
  },
  finance: {
    label: 'Financial Services',
    roles: [
      { key: 'sales',           label: 'Sales / Relationship Mgr', dailyLoss: 1800, rationale: 'Lost AUM growth, client attrition risk' },
      { key: 'compliance',      label: 'Compliance / Risk',        dailyLoss: 1400, rationale: 'Regulatory exposure, audit delays' },
      { key: 'analyst',         label: 'Analyst / Quant',          dailyLoss: 1100, rationale: 'Slower modelling, missed opportunities' },
      { key: 'accounting',      label: 'Accounting / Finance',     dailyLoss: 800,  rationale: 'Reporting delays, cash flow blind spots' },
      { key: 'operations',      label: 'Operations',               dailyLoss: 600,  rationale: 'Settlement delays, operational risk' },
      { key: 'management',      label: 'Management / Leadership',  dailyLoss: 2000, rationale: 'Strategic drift, regulatory risk' },
    ],
  },
  healthcare: {
    label: 'Healthcare & Life Sciences',
    roles: [
      { key: 'clinical',        label: 'Clinical / Medical',      dailyLoss: 1600, rationale: 'Reduced patient capacity, agency cover costs' },
      { key: 'nursing',         label: 'Nursing / Care',          dailyLoss: 900,  rationale: 'Agency premium spend, care quality risk' },
      { key: 'research',        label: 'Research / R&D',          dailyLoss: 1200, rationale: 'Trial delays, slower time-to-market' },
      { key: 'sales',           label: 'Medical Sales / Reps',    dailyLoss: 1300, rationale: 'Lost territory coverage, competitor gains' },
      { key: 'admin',           label: 'Admin / Coordination',    dailyLoss: 500,  rationale: 'Scheduling backlogs, referral delays' },
      { key: 'management',      label: 'Management / Leadership', dailyLoss: 1800, rationale: 'CQC risk, team attrition' },
    ],
  },
  professional: {
    label: 'Professional Services',
    roles: [
      { key: 'consultant',      label: 'Consultant / Advisor',   dailyLoss: 1400, rationale: 'Unbillable capacity, delayed engagements' },
      { key: 'sales',           label: 'Sales / BD',             dailyLoss: 1300, rationale: 'Pipeline gaps, missed tenders' },
      { key: 'legal',           label: 'Legal / Paralegal',      dailyLoss: 1100, rationale: 'Case backlogs, compliance risk' },
      { key: 'accounting',      label: 'Accounting / Audit',     dailyLoss: 900,  rationale: 'Filing delays, client dissatisfaction' },
      { key: 'marketing',       label: 'Marketing / Comms',      dailyLoss: 600,  rationale: 'Brand visibility, lead generation gaps' },
      { key: 'operations',      label: 'Operations / Admin',     dailyLoss: 500,  rationale: 'Process bottlenecks, team overload' },
      { key: 'management',      label: 'Management / Leadership',dailyLoss: 1700, rationale: 'Client relationship risk, strategic drift' },
    ],
  },
  retail: {
    label: 'Retail & Hospitality',
    roles: [
      { key: 'store_manager',   label: 'Store / Site Manager',   dailyLoss: 800,  rationale: 'Reduced service levels, stock issues' },
      { key: 'sales',           label: 'Sales / Floor Staff',    dailyLoss: 400,  rationale: 'Lost conversion, understaffing costs' },
      { key: 'buyer',           label: 'Buyer / Merchandiser',   dailyLoss: 900,  rationale: 'Stock gaps, missed margin opportunities' },
      { key: 'marketing',       label: 'Marketing / E-commerce', dailyLoss: 700,  rationale: 'Traffic decline, campaign delays' },
      { key: 'operations',      label: 'Logistics / Warehouse',  dailyLoss: 500,  rationale: 'Fulfilment delays, overtime costs' },
      { key: 'management',      label: 'Management / Leadership',dailyLoss: 1200, rationale: 'Multi-site coordination gaps' },
    ],
  },
  manufacturing: {
    label: 'Manufacturing & Engineering',
    roles: [
      { key: 'engineering',     label: 'Engineer / Technical',   dailyLoss: 1000, rationale: 'Production delays, quality issues' },
      { key: 'production',      label: 'Production / Operations',dailyLoss: 800,  rationale: 'Line downtime, overtime costs' },
      { key: 'quality',         label: 'Quality / HSE',          dailyLoss: 900,  rationale: 'Compliance risk, rejection rate increase' },
      { key: 'sales',           label: 'Sales / Account Mgr',   dailyLoss: 1100, rationale: 'Order pipeline gaps, customer risk' },
      { key: 'supply_chain',    label: 'Supply Chain / Procurement', dailyLoss: 700, rationale: 'Stock-outs, cost overruns' },
      { key: 'management',      label: 'Management / Leadership',dailyLoss: 1500, rationale: 'Operational drift, safety oversight gaps' },
    ],
  },
  education: {
    label: 'Education & Non-Profit',
    roles: [
      { key: 'teaching',        label: 'Teaching / Training',    dailyLoss: 600,  rationale: 'Supply teacher costs, curriculum delays' },
      { key: 'admin',           label: 'Administration',         dailyLoss: 350,  rationale: 'Enrolment bottlenecks, reporting delays' },
      { key: 'fundraising',     label: 'Fundraising / BD',       dailyLoss: 800,  rationale: 'Grant deadline risk, donor attrition' },
      { key: 'management',      label: 'Management / Leadership',dailyLoss: 1000, rationale: 'Governance gaps, strategic delays' },
    ],
  },
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export default function VacancyCostClient() {
  const [sector, setSector]     = useState('technology');
  const [roleKey, setRoleKey]   = useState('sales');
  const [daysOpen, setDaysOpen] = useState(30);
  const [salary, setSalary]     = useState(45000);
  const [vacancies, setVacancies] = useState(1);

  const sectorConfig = SECTORS[sector];
  const roles = sectorConfig?.roles ?? [];
  const selectedRole = roles.find(r => r.key === roleKey) ?? roles[0];

  // When sector changes, reset role to first in new sector
  function handleSectorChange(newSector: string) {
    setSector(newSector);
    const firstRole = SECTORS[newSector]?.roles[0];
    if (firstRole) setRoleKey(firstRole.key);
  }

  // Calculations
  const dailyLoss = selectedRole?.dailyLoss ?? 0;
  const totalLoss = dailyLoss * daysOpen * vacancies;
  const weeklyLoss = dailyLoss * 7 * vacancies;
  const monthlyLoss = dailyLoss * 30 * vacancies;

  // Recruitment cost estimate (typically 15-20% of salary for agency)
  const recruitmentCost = salary * 0.15;
  const totalWithRecruitment = totalLoss + recruitmentCost * vacancies;

  // Lost productivity during onboarding (first 3 months at ~50% productivity)
  const dailySalary = salary / 260;
  const onboardingCost = dailySalary * 65 * 0.5 * vacancies; // 65 working days × 50% productivity loss

  const milestones = useMemo(() => [
    { days: 7,  label: '1 week',  cost: dailyLoss * 7 * vacancies },
    { days: 14, label: '2 weeks', cost: dailyLoss * 14 * vacancies },
    { days: 30, label: '1 month', cost: dailyLoss * 30 * vacancies },
    { days: 60, label: '2 months',cost: dailyLoss * 60 * vacancies },
    { days: 90, label: '3 months',cost: dailyLoss * 90 * vacancies },
  ], [dailyLoss, vacancies]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Vacancy Cost Calculator</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Estimate the cost to your business of leaving a role unfilled
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg p-3 mb-5" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--purple)' }}>Estimate only.</strong> Daily loss figures are illustrative benchmarks based on industry research (Oxford Economics, CIPD, Cebr). Actual costs vary by company size, revenue model, team structure, and market conditions. Use this tool to build the business case for timely hiring, not as a financial forecast.
        </p>
      </div>

      {/* Inputs */}
      <div className="card p-5 mb-5">
        <p className="eyebrow mb-3">Role Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="form-group">
            <label className="label">Sector</label>
            <select
              className="input"
              value={sector}
              onChange={e => handleSectorChange(e.target.value)}
            >
              {Object.entries(SECTORS).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Role Category</label>
            <select
              className="input"
              value={roleKey}
              onChange={e => setRoleKey(e.target.value)}
            >
              {roles.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Annual Salary (£)</label>
            <input
              className="input"
              type="number"
              step="1000"
              min="0"
              value={salary}
              onChange={e => setSalary(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="label">Days Open</label>
            <input
              className="input"
              type="number"
              min="1"
              max="365"
              value={daysOpen}
              onChange={e => setDaysOpen(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="label">Number of Vacancies</label>
            <input
              className="input"
              type="number"
              min="1"
              max="50"
              value={vacancies}
              onChange={e => setVacancies(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="label">Est. Daily Loss</label>
            <p className="input cursor-not-allowed" style={{ background: 'var(--surface-soft)', color: 'var(--purple)', fontWeight: 600 }}>
              {formatCurrency(dailyLoss)}/day
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              Per vacancy, based on sector + role
            </p>
          </div>
        </div>

        {/* Rationale */}
        {selectedRole && (
          <div className="mt-4 flex items-start gap-2 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
            <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              <strong>{selectedRole.label}</strong> in <strong>{sectorConfig.label}</strong>: {selectedRole.rationale}
            </p>
          </div>
        )}
      </div>

      {/* Impact headline */}
      <div className="card p-6 mb-5" style={{ background: 'var(--gradient-soft)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(217,68,68,0.1)' }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--danger)' }}>Estimated Vacancy Cost</p>
            <p className="font-display font-bold text-2xl text-gradient">
              {formatCurrency(totalLoss)}
            </p>
          </div>
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Leaving {vacancies} <strong>{selectedRole?.label}</strong> role{vacancies > 1 ? 's' : ''} unfilled for <strong>{daysOpen} days</strong> could
          cost your business an estimated <strong style={{ color: 'var(--danger)' }}>{formatCurrency(totalLoss)}</strong> in
          lost productivity and revenue.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Weekly Loss</p>
          </div>
          <p className="font-display font-bold text-xl" style={{ color: 'var(--danger)' }}>{formatCurrency(weeklyLoss)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={14} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Monthly Loss</p>
          </div>
          <p className="font-display font-bold text-xl" style={{ color: '#D97706' }}>{formatCurrency(monthlyLoss)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <PoundSterling size={14} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Recruitment Cost</p>
          </div>
          <p className="font-display font-bold text-xl" style={{ color: 'var(--blue)' }}>{formatCurrency(recruitmentCost * vacancies)}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>~15% of salary (agency est.)</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} style={{ color: 'var(--ink-faint)' }} />
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Onboarding Loss</p>
          </div>
          <p className="font-display font-bold text-xl" style={{ color: '#14B8A6' }}>{formatCurrency(onboardingCost)}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>First 3 months at ~50% productivity</p>
        </div>
      </div>

      {/* Timeline breakdown */}
      <div className="card p-5 mb-5">
        <p className="eyebrow mb-4">Cost Escalation Timeline</p>
        <div className="space-y-3">
          {milestones.map(m => {
            const isActive = daysOpen >= m.days;
            const isPast = daysOpen > m.days;
            return (
              <div key={m.days} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-24 flex-shrink-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: isActive ? 'var(--danger)' : 'var(--line)' }}
                  />
                  <span className="text-xs font-medium" style={{ color: isActive ? 'var(--ink)' : 'var(--ink-faint)' }}>
                    {m.label}
                  </span>
                </div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((m.cost / (milestones[milestones.length - 1].cost || 1)) * 100, 100)}%`,
                      background: isActive
                        ? 'linear-gradient(90deg, var(--danger), #D97706)'
                        : 'var(--line)',
                      opacity: isActive ? 1 : 0.3,
                    }}
                  />
                </div>
                <span
                  className="text-sm font-semibold w-24 text-right flex-shrink-0"
                  style={{ color: isActive ? 'var(--danger)' : 'var(--ink-faint)' }}
                >
                  {formatCurrency(m.cost)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Total true cost */}
      <div className="card p-5">
        <p className="eyebrow mb-4">Total True Cost of Vacancy</p>
        <div className="space-y-3">
          {[
            { label: `Vacancy loss (${daysOpen} days)`, value: totalLoss, color: 'var(--danger)' },
            { label: 'Recruitment cost (~15% salary)', value: recruitmentCost * vacancies, color: 'var(--blue)' },
            { label: 'Onboarding productivity loss', value: onboardingCost, color: '#14B8A6' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{item.label}</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: item.color }}>
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Total Estimated Cost</span>
            <span className="text-lg font-bold text-gradient">
              {formatCurrency(totalLoss + recruitmentCost * vacancies + onboardingCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
