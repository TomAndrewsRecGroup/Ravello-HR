'use client';
import { useState } from 'react';
import { ArrowRight, ArrowLeft, Shield, AlertTriangle, XCircle } from 'lucide-react';

const questions = [
  {
    id: 'written_contracts',
    area: 'Employment Contracts',
    q: 'Do all employees have a written statement of employment particulars issued within 1 day of start?',
    risk: 'Up to 4 weeks\u2019 pay per employee in tribunal',
    options: [
      { label: 'Yes — all employees, up to date', score: 3 },
      { label: 'Most — a few legacy staff may not', score: 2 },
      { label: 'Some — we\'ve been inconsistent', score: 1 },
      { label: 'No formal contracts in place', score: 0 },
    ],
  },
  {
    id: 'handbook',
    area: 'Staff Handbook',
    q: 'Do you have an up-to-date staff handbook covering hybrid work, disciplinary, grievance and absence?',
    risk: 'Inconsistent management = tribunal risk',
    options: [
      { label: 'Yes — reviewed in the last 12 months', score: 3 },
      { label: 'Yes — but it\'s over 2 years old', score: 2 },
      { label: 'Basic version, not comprehensive', score: 1 },
      { label: 'No handbook', score: 0 },
    ],
  },
  {
    id: 'absence_management',
    area: 'Absence Management',
    q: 'Do you have a documented and consistently followed absence management procedure?',
    risk: 'Constructive dismissal and cost exposure',
    options: [
      { label: 'Yes — documented, trained, followed', score: 3 },
      { label: 'Informal process that most managers follow', score: 2 },
      { label: 'Ad hoc — manager dependent', score: 1 },
      { label: 'No process at all', score: 0 },
    ],
  },
  {
    id: 'disciplinary',
    area: 'Disciplinary Process',
    q: 'Have your managers been trained on how to run a fair disciplinary or capability process?',
    risk: 'Unfair dismissal claims averaging £10k+',
    options: [
      { label: 'Yes — formal training in last 2 years', score: 3 },
      { label: 'Informal guidance given', score: 2 },
      { label: 'They refer to the handbook only', score: 1 },
      { label: 'No training at all', score: 0 },
    ],
  },
  {
    id: 'right_to_work',
    area: 'Right to Work',
    q: 'Do you conduct and document right-to-work checks before every hire?',
    risk: 'Up to £20,000 civil penalty per employee',
    options: [
      { label: 'Yes — always, documented and stored', score: 3 },
      { label: 'Mostly — with some gaps', score: 2 },
      { label: 'Sometimes — inconsistently', score: 1 },
      { label: 'No formal checks', score: 0 },
    ],
  },
  {
    id: 'data_protection',
    area: 'HR Data Protection',
    q: 'Is employee personal data stored securely with a documented retention and deletion policy?',
    risk: 'GDPR fine up to 4% of turnover',
    options: [
      { label: 'Yes — GDPR-compliant HR data processes', score: 3 },
      { label: 'Partially — some gaps in storage', score: 2 },
      { label: 'We use HR software but no formal policy', score: 1 },
      { label: 'No data policy', score: 0 },
    ],
  },
  {
    id: 'equal_pay',
    area: 'Equal Pay & Pay Gaps',
    q: 'Do you have a pay benchmarking or banding system to ensure pay equity?',
    risk: 'Equal pay claims + gender pay gap reporting',
    options: [
      { label: 'Yes — documented salary bands reviewed annually', score: 3 },
      { label: 'Informal banding exists', score: 2 },
      { label: 'No formal banding', score: 1 },
      { label: 'No structure at all', score: 0 },
    ],
  },
  {
    id: 'mental_health',
    area: 'Wellbeing & Mental Health',
    q: 'Do you have trained Mental Health First Aiders or a documented wellbeing policy?',
    risk: 'Duty of care breach + retention impact',
    options: [
      { label: 'Yes — trained MHFAs and documented policy', score: 3 },
      { label: 'Policy exists but no trained first aiders', score: 2 },
      { label: 'EAP only — no formal policy', score: 1 },
      { label: 'Nothing in place', score: 0 },
    ],
  },
];

type Answer = { score: number; area: string; risk: string };

export default function HRRiskScoreTool() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentChoice, setCurrentChoice] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalQuestions = questions.length;
  const isEmailGate = step === totalQuestions;

  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const maxScore = totalQuestions * 3;
  const percentage = Math.round((totalScore / maxScore) * 100);

  const getRiskLevel = () => {
    if (percentage >= 75) return { label: 'Low Risk', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: Shield };
    if (percentage >= 45) return { label: 'Medium Risk', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: AlertTriangle };
    return { label: 'High Risk', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle };
  };

  const getTopRisks = () =>
    answers
      .filter((a) => a.score < 2)
      .map((a) => ({ area: a.area, risk: a.risk }))
      .slice(0, 3);

  const handleNext = () => {
    if (currentChoice === null) return;
    const q = questions[step];
    setAnswers([...answers, { score: q.options[currentChoice].score, area: q.area, risk: q.risk }]);
    setCurrentChoice(null);
    setStep(step + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/leads/hr-risk-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, score: totalScore, maxScore, percentage, topRisks: getTopRisks() }),
      });
    } catch (_) {}
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    const riskInfo = getRiskLevel();
    const Icon = riskInfo.icon;
    const topRisks = getTopRisks();

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className={`p-6 rounded-xl border ${riskInfo.bg} ${riskInfo.border} mb-8 text-center`}>
          <Icon size={40} className={`mx-auto mb-3 ${riskInfo.color}`} />
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-1">Your HR Risk Level</p>
          <p className={` text-5xl font-bold ${riskInfo.color} mb-1`}>{percentage}%</p>
          <p className={`font-bold text-xl ${riskInfo.color}`}>{riskInfo.label}</p>
        </div>

        {topRisks.length > 0 && (
          <div className="mb-8">
            <h3 className="font-bold text-[var(--ink)] mb-4">Your Top 3 Compliance Exposures:</h3>
            <div className="space-y-3">
              {topRisks.map((r) => (
                <div key={r.area} className="p-4 bg-red-50 border border-red-100 rounded-xl">
                  <p className="font-semibold text-red-800 text-sm">{r.area}</p>
                  <p className="text-red-600 text-xs mt-1">⚠️ Exposure: {r.risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[var(--brand-navy)] rounded-xl p-6 text-center">
          <p className="text-white font-semibold mb-2">Want a full compliance gap report?</p>
          <p className="text-white/70 text-sm mb-4">We\'ll review your top exposures and give you a prioritised fix list in one call.</p>
          <a href="/policysafe" className="btn-gradient">
            Explore PolicySafe™ <ArrowRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  if (isEmailGate) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <Shield size={40} className="text-[var(--brand-purple)] mx-auto mb-3" />
          <h2 className=" text-2xl font-bold text-[var(--ink)] mb-2">Your risk score is ready.</h2>
          <p className="text-[var(--ink-soft)]">Unlock your full risk report with your top 3 compliance exposures and recommended actions.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <input type="email" placeholder="Your work email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]" />
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? 'Unlocking…' : 'Unlock My Risk Report'} <ArrowRight size={16} />
          </button>
          <p className="text-center text-xs text-gray-400">We\'ll send your report by email. No spam, ever.</p>
        </form>
      </div>
    );
  }

  const q = questions[step];
  const progress = (step / totalQuestions) * 100;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--brand-purple)] uppercase tracking-widest">{q.area}</span>
          <span className="text-xs text-[var(--ink-soft)]">{step + 1} of {totalQuestions}</span>
        </div>
        <div className="risk-bar"><div className="risk-bar-fill bg-[var(--brand-purple)]" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
        ⚠️ Risk if unaddressed: <span className="font-semibold">{q.risk}</span>
      </div>
      <h2 className=" text-xl font-bold text-[var(--ink)] mb-6">{q.q}</h2>
      <div className="space-y-3 mb-8">
        {q.options.map((opt, i) => (
          <button key={i} onClick={() => setCurrentChoice(i)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${ currentChoice === i ? 'border-[var(--brand-purple)] bg-purple-50 text-[var(--ink)]' : 'border-gray-100 hover:border-[var(--brand-purple)]/30 text-[var(--ink-soft)]' }`}>
            <span className="text-sm font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => { setStep(step - 1); setCurrentChoice(null); }} disabled={step === 0} className="flex items-center gap-2 text-[var(--ink-soft)] text-sm hover:text-[var(--ink)] disabled:opacity-30">
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={handleNext} disabled={currentChoice === null} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          {step === totalQuestions - 1 ? 'See My Risk Score' : 'Next'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
