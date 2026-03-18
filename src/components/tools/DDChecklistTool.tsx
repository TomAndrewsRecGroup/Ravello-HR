'use client';
import { useState } from 'react';
import { CheckCircle, XCircle, ArrowRight, AlertTriangle } from 'lucide-react';

const categories = [
  {
    name: 'Workforce Structure',
    items: [
      { id: 'org_chart', label: 'Org chart and reporting lines documented', risk: 'Unclear accountability post-close' },
      { id: 'headcount', label: 'Accurate headcount by role, location, and contract type', risk: 'Hidden cost base' },
      { id: 'key_persons', label: 'Key person dependencies identified', risk: 'Value walks out after close' },
      { id: 'contractors', label: 'Contractor / IR35 status reviewed', risk: 'HMRC liability exposure' },
    ],
  },
  {
    name: 'Employment Terms & Liability',
    items: [
      { id: 'contracts_reviewed', label: 'All employment contracts reviewed', risk: 'TUPE inherited liabilities' },
      { id: 'notice_periods', label: 'Notice periods and garden leave clauses mapped', risk: 'Business continuity risk' },
      { id: 'non_compete', label: 'Restrictive covenants reviewed for enforceability', risk: 'Competitor walk-outs post-deal' },
      { id: 'claims', label: 'Active or pending employment claims identified', risk: 'Financial and reputational liability' },
    ],
  },
  {
    name: 'Culture & Retention Risk',
    items: [
      { id: 'turnover_data', label: 'Turnover data (last 24 months) reviewed', risk: 'Hidden culture or leadership problem' },
      { id: 'engagement', label: 'Employee engagement or survey data available', risk: 'Post-close attrition surge' },
      { id: 'retention_plan', label: 'Key talent retention plan agreed pre-close', risk: 'Deal value loss' },
      { id: 'union', label: 'Union or works council obligations identified', risk: 'Mandatory consultation delays' },
    ],
  },
  {
    name: 'Compensation & Benefits',
    items: [
      { id: 'pay_benchmarking', label: 'Pay benchmarked against market', risk: 'Immediate attrition post-announcement' },
      { id: 'pension', label: 'Pension obligations and deficits reviewed', risk: 'Defined benefit deficit liability' },
      { id: 'bonus', label: 'Bonus, commission and LTI schemes documented', risk: 'Unexpected cost on change of control' },
    ],
  },
  {
    name: 'Post-Acquisition Integration',
    items: [
      { id: 'tupe_plan', label: 'TUPE / transfer plan drafted', risk: 'Legal challenge to transfer' },
      { id: 'comms_plan', label: 'Employee communication plan ready for Day 1', risk: 'Rumour, anxiety, attrition' },
      { id: 'integration_lead', label: 'HR integration lead appointed', risk: 'Chaotic people experience' },
    ],
  },
];

export default function DDChecklistTool() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const allItems = categories.flatMap((c) => c.items);
  const checkedCount = allItems.filter((i) => checked[i.id]).length;
  const totalItems = allItems.length;
  const missingItems = allItems.filter((i) => !checked[i.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/leads/dd-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, checkedCount, totalItems, missing: missingItems.map((i) => i.label) }),
      });
    } catch (_) {}
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-8">
          <p className="text-[var(--ink-soft)] text-sm mb-1">Your due diligence score</p>
          <h2 className=" text-2xl font-bold text-[var(--ink)]">
            {checkedCount} of {totalItems} items confirmed
          </h2>
          <p className={`font-semibold mt-2 ${ checkedCount >= totalItems * 0.8 ? 'text-green-600' : checkedCount >= totalItems * 0.5 ? 'text-yellow-600' : 'text-red-600' }`}>
            {checkedCount >= totalItems * 0.8 ? 'Well prepared' : checkedCount >= totalItems * 0.5 ? 'Gaps to close before signing' : 'Significant people risk unaddressed'}
          </p>
        </div>

        {missingItems.length > 0 && (
          <div className="mb-8">
            <h3 className="font-bold text-[var(--ink)] mb-3 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-500" /> Unchecked Items (risk flags):</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {missingItems.map((item) => (
                <div key={item.id} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                  <XCircle size={15} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900">{item.label}</p>
                    <p className="text-xs text-yellow-700 mt-0.5">{item.risk}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[var(--brand-navy)] rounded-xl p-6 text-center">
          <p className="text-white font-semibold mb-2">DealReady People™ covers all of this.</p>
          <p className="text-white/70 text-sm mb-4">We handle pre-deal due diligence, TUPE planning, Day 1 comms and post-close integration.</p>
          <a href="/dealready-people" className="btn-gradient">Explore DealReady People™ <ArrowRight size={16} /></a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--ink-soft)]">Tick every item you have confirmed ahead of close:</p>
        <span className="text-[var(--brand-purple)] font-bold text-sm">{checkedCount}/{totalItems}</span>
      </div>

      <div className="space-y-8 mb-8">
        {categories.map((cat) => (
          <div key={cat.name}>
            <h3 className="font-bold text-[var(--ink)] text-sm uppercase tracking-widest mb-3">{cat.name}</h3>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <label key={item.id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${ checked[item.id] ? 'border-[var(--brand-purple)] bg-purple-50' : 'border-gray-100 hover:border-gray-200' }`}>
                  <div className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center flex-shrink-0 ${ checked[item.id] ? 'bg-[var(--brand-purple)]' : 'border-2 border-gray-300' }`}>
                    {checked[item.id] && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)} className="sr-only" />
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
                    <p className="text-xs text-[var(--ink-soft)] mt-0.5">⚠️ {item.risk}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-6">
        <p className="font-semibold text-[var(--ink)] mb-4">Get your risk summary report</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? 'Generating…' : 'Get My Risk Summary'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
