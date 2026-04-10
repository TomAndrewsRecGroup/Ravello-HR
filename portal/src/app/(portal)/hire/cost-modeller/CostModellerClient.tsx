'use client';
import { useState } from 'react';
import { Calculator, Plus, Trash2, PoundSterling } from 'lucide-react';

interface HireRow {
  id: number;
  title: string;
  salary: number;
  count: number;
}

const EMPLOYER_NI_RATE = 0.15;
const EMPLOYER_NI_THRESHOLD = 5000; // annual secondary threshold 2025/26
const DEFAULT_PENSION_RATE = 0.03;
const EMPLOYMENT_ALLOWANCE = 10500; // annual employment allowance 2025/26 — most SMEs can claim

function calcEmployerNI(salary: number): number {
  if (salary <= EMPLOYER_NI_THRESHOLD) return 0;
  return (salary - EMPLOYER_NI_THRESHOLD) * EMPLOYER_NI_RATE;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export default function CostModellerClient() {
  const [rows, setRows] = useState<HireRow[]>([
    { id: 1, title: '', salary: 35000, count: 1 },
  ]);
  const [pensionRate, setPensionRate] = useState(3);
  const [benefitsCost, setBenefitsCost] = useState(0); // per person annual
  const [claimAllowance, setClaimAllowance] = useState(false); // employment allowance

  let nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;

  function addRow() {
    setRows(prev => [...prev, { id: nextId, title: '', salary: 35000, count: 1 }]);
  }
  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }
  function updateRow(id: number, field: string, val: string | number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }

  // Calculate totals
  const pension = pensionRate / 100;
  const breakdown = rows.map(row => {
    const baseSalary = row.salary * row.count;
    const ni = calcEmployerNI(row.salary) * row.count;
    const pen = row.salary * pension * row.count;
    const benefits = benefitsCost * row.count;
    const total = baseSalary + ni + pen + benefits;
    return { ...row, baseSalary, ni, pen, benefits, total };
  });

  const grossNI = breakdown.reduce((s, r) => s + r.ni, 0);
  const allowanceSaving = claimAllowance ? Math.min(grossNI, EMPLOYMENT_ALLOWANCE) : 0;
  const grandNI = grossNI - allowanceSaving;
  const grandSalary = breakdown.reduce((s, r) => s + r.baseSalary, 0);
  const grandPension = breakdown.reduce((s, r) => s + r.pen, 0);
  const grandBenefits = breakdown.reduce((s, r) => s + r.benefits, 0);
  const grandTotal = grandSalary + grandNI + grandPension + grandBenefits;
  const totalHeads = rows.reduce((s, r) => s + r.count, 0);
  const monthlyBurn = grandTotal / 12;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title text-xl">Employment Cost Modeller</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Employer costs only — salary + employer NI (15%) + pension + benefits (2025/26 rates)
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg p-3 mb-5" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--purple)' }}>Estimate only.</strong> Figures are based on HMRC 2025/26 employer NI rates (15%, £5,000 threshold), statutory minimum auto-enrolment pension (3%), and your inputs. Actual costs may vary depending on salary sacrifice arrangements, apprenticeship levy liability, benefits in kind, and other employer obligations. Always consult your accountant or payroll provider for precise figures.
        </p>
      </div>

      {/* Configuration */}
      <div className="card p-5 mb-5">
        <p className="eyebrow mb-3">Company Defaults</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="form-group">
            <label className="label">Employer NI Rate</label>
            <p className="input cursor-not-allowed" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
              15% (2025/26 statutory)
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              Threshold: £5,000/yr per employee
            </p>
          </div>
          <div className="form-group">
            <label className="label">Employer Pension (%)</label>
            <input
              className="input"
              type="number"
              step="0.5"
              min="0"
              max="20"
              value={pensionRate}
              onChange={e => setPensionRate(parseFloat(e.target.value) || 0)}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              Min auto-enrolment: 3%
            </p>
          </div>
          <div className="form-group">
            <label className="label">Benefits per person (annual)</label>
            <input
              className="input"
              type="number"
              step="100"
              min="0"
              value={benefitsCost}
              onChange={e => setBenefitsCost(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 2000 (health, gym etc.)"
            />
          </div>
          <div className="form-group">
            <label className="label">Employment Allowance</label>
            <button
              type="button"
              onClick={() => setClaimAllowance(!claimAllowance)}
              className="input flex items-center gap-2 text-left"
              style={{ background: claimAllowance ? 'rgba(124,58,237,0.06)' : undefined }}
            >
              <span
                className="flex-shrink-0 w-8 h-5 rounded-full relative transition-colors"
                style={{ background: claimAllowance ? 'var(--purple)' : 'var(--line)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{ left: claimAllowance ? 14 : 2 }}
                />
              </span>
              <span className="text-xs" style={{ color: claimAllowance ? 'var(--purple)' : 'var(--ink-faint)' }}>
                {claimAllowance ? `Claiming (−${formatCurrency(allowanceSaving)})` : 'Not claiming'}
              </span>
            </button>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
              Up to £10,500/yr off your NI bill
            </p>
          </div>
        </div>
      </div>

      {/* Hire rows */}
      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--line)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Planned Hires</p>
          <button onClick={addRow} className="btn-secondary btn-sm">
            <Plus size={12} /> Add Role
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Role Title</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Salary</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Heads</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Employer NI</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider hide-mobile" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Pension</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)', background: 'var(--surface-soft)' }}>Total Cost</th>
                <th className="px-2 py-3" style={{ background: 'var(--surface-soft)' }}></th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="px-4 py-3">
                    <input
                      className="input py-1.5"
                      value={row.title}
                      onChange={e => updateRow(row.id, 'title', e.target.value)}
                      placeholder="e.g. Software Engineer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="input py-1.5 text-right"
                      type="number"
                      step="1000"
                      min="0"
                      value={row.salary}
                      onChange={e => updateRow(row.id, 'salary', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="input py-1.5 text-center w-16 mx-auto"
                      type="number"
                      min="1"
                      max="50"
                      value={row.count}
                      onChange={e => updateRow(row.id, 'count', parseInt(e.target.value) || 1)}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium hide-mobile" style={{ color: 'var(--ink-soft)' }}>
                    {formatCurrency(row.ni)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium hide-mobile" style={{ color: 'var(--ink-soft)' }}>
                    {formatCurrency(row.pen)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--purple)' }}>
                    {formatCurrency(row.total)}
                  </td>
                  <td className="px-2 py-3">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="btn-icon">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Total Headcount</p>
          <p className="font-display font-bold text-2xl" style={{ color: 'var(--purple)' }}>{totalHeads}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Annual Cost</p>
          <p className="font-display font-bold text-2xl text-gradient">{formatCurrency(grandTotal)}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Monthly Burn</p>
          <p className="font-display font-bold text-2xl" style={{ color: 'var(--blue)' }}>{formatCurrency(monthlyBurn)}</p>
        </div>
        <div className="card p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Avg Cost per Head</p>
          <p className="font-display font-bold text-2xl" style={{ color: 'var(--teal)' }}>
            {totalHeads > 0 ? formatCurrency(grandTotal / totalHeads) : '—'}
          </p>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="card p-5">
        <p className="eyebrow mb-4">Cost Breakdown</p>
        <div className="space-y-3">
          {[
            { label: 'Base Salary', value: grandSalary, color: 'var(--ink)' },
            { label: `Employer NI (15%)${claimAllowance ? ` less £${(allowanceSaving / 1000).toFixed(1)}k allowance` : ''}`, value: grandNI, color: 'var(--amber)' },
            { label: `Pension (${pensionRate}%)`, value: grandPension, color: 'var(--blue)' },
            { label: 'Benefits', value: grandBenefits, color: 'var(--teal)' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{item.label}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: grandTotal > 0 ? `${Math.round((item.value / grandTotal) * 100)}%` : '0%',
                      background: item.color,
                    }}
                  />
                </div>
                <span className="text-sm font-semibold w-24 text-right" style={{ color: item.color }}>
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Total Annual Employment Cost</span>
            <span className="text-lg font-bold text-gradient">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
