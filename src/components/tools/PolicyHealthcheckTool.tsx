'use client';
import { useState } from 'react';
import { CheckCircle, XCircle, ArrowRight, FileText } from 'lucide-react';

const policies = [
  { id: 'contract', label: 'Written Employment Contracts', risk: 'Statutory right breach — up to 4 weeks\u2019 pay per employee', priority: 'Critical' },
  { id: 'handbook', label: 'Staff Handbook (comprehensive)', risk: 'Inconsistent management, tribunal exposure', priority: 'Critical' },
  { id: 'disciplinary', label: 'Disciplinary & Dismissal Procedure', risk: 'Unfair dismissal claims', priority: 'Critical' },
  { id: 'grievance', label: 'Grievance Procedure', risk: 'Constructive dismissal exposure', priority: 'Critical' },
  { id: 'absence', label: 'Absence Management Policy', risk: 'Discrimination claims, uncontrolled absence cost', priority: 'High' },
  { id: 'equality', label: 'Equality & Diversity Policy', risk: 'Discrimination claims', priority: 'High' },
  { id: 'hybrid', label: 'Hybrid / Remote Working Policy', risk: 'Inconsistent treatment, employee disputes', priority: 'High' },
  { id: 'data', label: 'HR Data & GDPR Policy', risk: 'ICO fines up to 4% of turnover', priority: 'High' },
  { id: 'health_safety', label: 'Health & Safety Policy', risk: 'HSE enforcement, personal injury liability', priority: 'High' },
  { id: 'maternity', label: 'Maternity / Paternity / Parental Leave Policy', risk: 'Discrimination claims', priority: 'Medium' },
  { id: 'performance', label: 'Performance Management Framework', risk: 'Capability dismissal challenges', priority: 'Medium' },
  { id: 'redundancy', label: 'Redundancy Policy', risk: 'Unfair dismissal, TUPE exposure', priority: 'Medium' },
  { id: 'whistleblowing', label: 'Whistleblowing / Speak Up Policy', risk: 'Public interest disclosure liability', priority: 'Medium' },
  { id: 'social_media', label: 'Social Media & Communications Policy', risk: 'Reputational and disciplinary issues', priority: 'Lower' },
  { id: 'expenses', label: 'Expenses & Benefits Policy', risk: 'HMRC compliance issues', priority: 'Lower' },
];

export default function PolicyHealthcheckTool() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const missing = policies.filter((p) => !checked[p.id]);
  const critical = missing.filter((p) => p.priority === 'Critical');
  const high = missing.filter((p) => p.priority === 'High');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/leads/policy-healthcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, missing: missing.map((p) => p.label), criticalCount: critical.length }),
      });
    } catch (_) {}
    setSubmitting(false);
    setSubmitted(true);
    setResultsVisible(true);
  };

  if (resultsVisible) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-8">
          <p className="text-[var(--ink-soft)] text-sm mb-1">Your policy gap report</p>
          <h2 className=" text-2xl font-bold text-[var(--ink)]">You\'re missing <span className="text-red-500">{missing.length}</span> of {policies.length} documents</h2>
          {critical.length > 0 && <p className="text-red-600 font-semibold mt-2">{critical.length} critical gaps with immediate legal risk</p>}
        </div>

        {critical.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2"><XCircle size={18} /> Critical Gaps</h3>
            <div className="space-y-2">
              {critical.map((p) => (
                <div key={p.id} className="p-4 bg-red-50 border border-red-100 rounded-xl">
                  <p className="font-semibold text-red-800 text-sm">{p.label}</p>
                  <p className="text-red-600 text-xs mt-1">{p.risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {high.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-yellow-700 mb-3">High Priority Gaps</h3>
            <div className="space-y-2">
              {high.map((p) => (
                <div key={p.id} className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                  <p className="font-medium text-yellow-800 text-sm">{p.label}</p>
                  <p className="text-yellow-700 text-xs mt-0.5">{p.risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[var(--brand-navy)] rounded-xl p-6 text-center mt-6">
          <p className="text-white font-semibold mb-2">PolicySafe™ fixes all of this.</p>
          <p className="text-white/70 text-sm mb-4">Our Gold package covers every document on this list, tailored to your business, ready in 5 working days.</p>
          <a href="/policysafe" className="btn-gradient">Explore PolicySafe™ <ArrowRight size={16} /></a>
        </div>
      </div>
    );
  }

  if (submitted && !resultsVisible) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <p className="text-sm text-[var(--ink-soft)] mb-6">Tick every policy or document you currently have in place (up to date and accessible to staff):</p>
      <div className="space-y-2 mb-8">
        {policies.map((p) => (
          <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${ checked[p.id] ? 'border-[var(--brand-purple)] bg-purple-50' : 'border-gray-100 hover:border-gray-200' }`}>
            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${ checked[p.id] ? 'bg-[var(--brand-purple)]' : 'border-2 border-gray-300' }`}>
              {checked[p.id] && <CheckCircle size={12} className="text-white" />}
            </div>
            <input type="checkbox" checked={!!checked[p.id]} onChange={() => toggle(p.id)} className="sr-only" />
            <div className="flex-1">
              <span className="text-sm font-medium text-[var(--ink)]">{p.label}</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${ p.priority === 'Critical' ? 'bg-red-100 text-red-700' : p.priority === 'High' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500' }`}>{p.priority}</span>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-6">
        <p className="font-semibold text-[var(--ink)] mb-4 flex items-center gap-2"><FileText size={18} className="text-[var(--brand-purple)]" /> Get your personalised gap report</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? 'Generating…' : 'Generate My Gap Report'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
