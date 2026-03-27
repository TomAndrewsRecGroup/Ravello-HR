'use client';
import { useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const questions = [
  {
    id: 'role_definition',
    area: 'Role Definition',
    q: 'Before advertising a role, do you document a clear success profile (not just a job spec)?',
    options: [
      { label: 'Yes: always, with structured criteria', score: 3 },
      { label: 'Sometimes: depends on the role', score: 2 },
      { label: 'Rarely: we post the old job spec', score: 1 },
      { label: 'No: we wing it', score: 0 },
    ],
  },
  {
    id: 'assessment',
    area: 'Assessment Consistency',
    q: 'Do all candidates for the same role go through an identical assessment process?',
    options: [
      { label: 'Yes: structured scorecard every time', score: 3 },
      { label: 'Mostly: but it varies by interviewer', score: 2 },
      { label: 'No: each manager does it differently', score: 1 },
      { label: 'No formal assessment at all', score: 0 },
    ],
  },
  {
    id: 'interview_training',
    area: 'Interview Training',
    q: 'Have your hiring managers received structured interview training in the last 2 years?',
    options: [
      { label: 'Yes: formal training with certification', score: 3 },
      { label: 'Informal coaching or shadowing', score: 2 },
      { label: 'No formal training but experienced managers', score: 1 },
      { label: 'No training at all', score: 0 },
    ],
  },
  {
    id: 'decision_speed',
    area: 'Decision Speed',
    q: 'How long does it typically take from final interview to offer?',
    options: [
      { label: 'Under 48 hours', score: 3 },
      { label: '2–5 working days', score: 2 },
      { label: '1–2 weeks', score: 1 },
      { label: 'More than 2 weeks', score: 0 },
    ],
  },
  {
    id: 'offer_dropoff',
    area: 'Offer Drop-off',
    q: 'In the last year, how many accepted offers were then declined before start date?',
    options: [
      { label: 'None', score: 3 },
      { label: '1–2 cases', score: 2 },
      { label: '3–5 cases', score: 1 },
      { label: 'More than 5, or we don\'t track this', score: 0 },
    ],
  },
  {
    id: 'agency_reliance',
    area: 'Agency Reliance',
    q: 'What percentage of hires come through recruitment agencies?',
    options: [
      { label: 'Under 20%: mostly direct', score: 3 },
      { label: '20–40%', score: 2 },
      { label: '40–70%', score: 1 },
      { label: 'Over 70% or all agency-led', score: 0 },
    ],
  },
  {
    id: 'rehire_rate',
    area: 'Role Reopening',
    q: 'Have you had to rehire for the same role within 12 months in the last 2 years?',
    options: [
      { label: 'No: strong retention record', score: 3 },
      { label: 'Once or twice across the business', score: 2 },
      { label: 'Yes: 3 or more times', score: 1 },
      { label: 'Frequently: it\'s a pattern', score: 0 },
    ],
  },
  {
    id: 'onboarding',
    area: 'Onboarding',
    q: 'Do you have a structured 90-day onboarding plan for new hires?',
    options: [
      { label: 'Yes: documented and consistently followed', score: 3 },
      { label: 'Partial: some structure but not formal', score: 2 },
      { label: 'Ad hoc: manager-dependent', score: 1 },
      { label: 'No onboarding plan', score: 0 },
    ],
  },
];

type Answer = { score: number; area: string };

export default function HiringScoreTool() {
  const [step, setStep] = useState(0); // 0 = questions, questions.length = email gate, questions.length+1 = results
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentChoice, setCurrentChoice] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalQuestions = questions.length;
  const isEmailGate = step === totalQuestions;
  const isResults = submitted;

  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const maxScore = totalQuestions * 3;
  const percentage = Math.round((totalScore / maxScore) * 100);

  const getScoreLabel = () => {
    if (percentage >= 75) return { label: 'Strong', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle };
    if (percentage >= 50) return { label: 'Leaking', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: AlertCircle };
    return { label: 'Broken', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle };
  };

  const getWeakAreas = () =>
    answers
      .filter((a) => a.score < 2)
      .map((a) => a.area)
      .slice(0, 3);

  const handleNext = () => {
    if (currentChoice === null) return;
    const q = questions[step];
    setAnswers([...answers, { score: q.options[currentChoice].score, area: q.area }]);
    setCurrentChoice(null);
    setStep(step + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/leads/hiring-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          score: totalScore,
          maxScore,
          percentage,
          weakAreas: getWeakAreas(),
          answers,
        }),
      });
    } catch (_) {}
    setSubmitting(false);
    setSubmitted(true);
  };

  if (isResults) {
    const scoreInfo = getScoreLabel();
    const Icon = scoreInfo.icon;
    const weakAreas = getWeakAreas();

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className={`p-6 rounded-xl border ${scoreInfo.bg} ${scoreInfo.border} mb-8 text-center`}>
          <Icon size={40} className={`mx-auto mb-3 ${scoreInfo.color}`} />
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-1">Your Smart Hiring Score</p>
          <p className={` text-5xl font-bold ${scoreInfo.color} mb-1`}>{percentage}%</p>
          <p className={`font-bold text-xl ${scoreInfo.color}`}>Hiring is: {scoreInfo.label}</p>
        </div>

        {weakAreas.length > 0 && (
          <div className="mb-8">
            <h3 className="font-bold text-[var(--ink)] mb-4">Your Hiring is Leaking At:</h3>
            <div className="space-y-2">
              {weakAreas.map((area) => (
                <div key={area} className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <XCircle size={16} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-red-800">{area}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8">
          <h3 className="font-bold text-[var(--ink)] mb-4">Your Fix Plan:</h3>
          <div className="space-y-3">
            {[
              { period: '7 Days', action: 'Audit your last 3 hire failures and identify the common point of breakdown.' },
              { period: '30 Days', action: 'Implement a structured scorecard and success profile template for all open roles.' },
              { period: '90 Days', action: 'Run hiring manager training, reduce agency spend by 30% through direct sourcing.' },
            ].map((f) => (
              <div key={f.period} className="flex gap-4 p-4 bg-brand-light rounded-xl">
                <span className="bg-[var(--brand-purple)] text-white text-xs font-bold px-2.5 py-1 rounded-full h-fit whitespace-nowrap">{f.period}</span>
                <p className="text-[var(--ink-soft)] text-sm">{f.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--brand-navy)] rounded-xl p-6 text-center">
          <p className="text-white font-semibold mb-2">Want us to implement this with you?</p>
          <p className="text-white/70 text-sm mb-4">Book a 20-min scoping call and we’ll walk through your specific results.</p>
          <a href="/book" className="btn-gradient">
            Book Your Scoping Call <ArrowRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  if (isEmailGate) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[var(--brand-purple)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-[var(--brand-purple)]" />
          </div>
          <h2 className=" text-2xl font-bold text-[var(--ink)] mb-2">Your score is ready.</h2>
          <p className="text-[var(--ink-soft)]">Enter your details to unlock your full Hiring Score report and personalised fix plan.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Your first name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]"
          />
          <input
            type="email"
            placeholder="Your work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-purple)] text-[var(--ink)]"
          />
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? 'Unlocking…' : 'Unlock My Hiring Score'} <ArrowRight size={16} />
          </button>
          <p className="text-center text-xs text-gray-400">No spam. We’ll email your report and nothing else (unless you want more).</p>
        </form>
      </div>
    );
  }

  const q = questions[step];
  const progress = ((step) / totalQuestions) * 100;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--brand-purple)] uppercase tracking-widest">{q.area}</span>
          <span className="text-xs text-[var(--ink-soft)]">{step + 1} of {totalQuestions}</span>
        </div>
        <div className="risk-bar">
          <div className="risk-bar-fill bg-[var(--brand-purple)]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question */}
      <h2 className=" text-xl font-bold text-[var(--ink)] mb-6">{q.q}</h2>

      {/* Options */}
      <div className="space-y-3 mb-8">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => setCurrentChoice(i)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              currentChoice === i
                ? 'border-[var(--brand-purple)] bg-purple-50 text-[var(--ink)]'
                : 'border-gray-100 hover:border-[var(--brand-purple)]/30 text-[var(--ink-soft)]'
            }`}
          >
            <span className="text-sm font-medium">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setStep(step - 1); setCurrentChoice(null); }}
          disabled={step === 0}
          className="flex items-center gap-2 text-[var(--ink-soft)] text-sm hover:text-[var(--ink)] disabled:opacity-30"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={handleNext}
          disabled={currentChoice === null}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {step === totalQuestions - 1 ? 'See My Score' : 'Next'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
