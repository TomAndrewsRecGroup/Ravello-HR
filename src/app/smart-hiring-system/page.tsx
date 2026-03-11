import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, XCircle, TrendingDown, Clock, PoundSterling, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Smart Hiring System™ | Fix Hiring Drift | Ravello HR',
  description:
    'Stop reopening roles. Cut agency spend. The Smart Hiring System™ by Ravello HR fixes the 5 failure points where most hiring falls apart.',
  alternates: { canonical: 'https://ravellohr.co.uk/smart-hiring-system' },
};

const failurePoints = [
  {
    icon: XCircle,
    title: 'Vague role definitions',
    description: 'Hiring managers describe the person they last worked with, not the role they actually need. You interview the wrong people for months.',
    color: 'text-red-500',
  },
  {
    icon: TrendingDown,
    title: 'Inconsistent assessment',
    description: 'No scorecard. No structure. Three interviewers, three different opinions. The best candidate loses to the most confident one.',
    color: 'text-orange-500',
  },
  {
    icon: Clock,
    title: 'Decision speed',
    description: 'Good candidates are gone in 7 days. Your process takes 6 weeks. You wonder why offers keep getting declined.',
    color: 'text-yellow-600',
  },
  {
    icon: PoundSterling,
    title: 'Agency dependency',
    description: 'Every hard role goes straight to an agency. No internal capability built. The fee bill grows every year.',
    color: 'text-red-600',
  },
  {
    icon: Users,
    title: 'Offer drop-off',
    description: 'Candidates accept then ghost. Or join and leave within 90 days. The root cause is always earlier in the process.',
    color: 'text-purple-500',
  },
];

const systemSteps = [
  {
    step: '01',
    title: 'Role Architecture',
    description: 'Define the role around outcomes, not a wish list. We build a role brief that attracts the right people and filters the wrong ones before you spend a minute interviewing.',
  },
  {
    step: '02',
    title: 'Assessment Design',
    description: 'A structured scorecard for every stage. Every interviewer scores the same criteria. Gut feel becomes a tiebreaker, not the deciding vote.',
  },
  {
    step: '03',
    title: 'Process Velocity',
    description: 'Map your hiring timeline against where candidates drop. We cut steps that add delay without adding signal — typically halving time-to-offer.',
  },
  {
    step: '04',
    title: 'Manager Enablement',
    description: 'Train hiring managers to interview with intent. Scripts, red flags, scoring guidance. One session. Permanent improvement.',
  },
  {
    step: '05',
    title: 'Offer & Onboarding Bridge',
    description: 'The gap between offer and day one is where candidates change their minds. We close it with structured pre-boarding that makes joining a no-brainer.',
  },
];

const outcomes = [
  'Roles filled in fewer attempts',
  'Agency spend reduced or eliminated on repeatable roles',
  'Hiring manager confidence measurably improved',
  'Offer acceptance rate increases',
  'New hire retention at 12 months improves',
  'A reusable system — not a one-time fix',
];

export default function SmartHiringSystemPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="gradient-hero text-white py-20 lg:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <span className="funnel-tag bg-brand-teal text-white mb-6 inline-block">Smart Hiring System™</span>
          <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            Hiring is broken.<br />
            <span className="text-gradient">Here’s how to fix it.</span>
          </h1>
          <p className="text-white/80 text-xl mb-4 max-w-2xl">
            Most businesses reopen the same roles every 12–18 months. They pay agency fees on repeat. They promote managers into hiring without training them. The problem isn’t the talent market — it’s the system.
          </p>
          <p className="text-white/70 text-lg mb-10 max-w-2xl">
            The Smart Hiring System™ fixes the five points where hiring falls apart — and builds an internal capability that compounds over time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/tools/hiring-score" className="btn-primary text-base">
              Get Your Smart Hiring Score <ArrowRight size={18} />
            </Link>
            <Link href="/book" className="btn-outline text-base border-white text-white hover:bg-white hover:text-brand-navy">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      {/* Pain Agitation */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              The 5 places your hiring is leaking
            </h2>
            <p className="text-brand-slate text-lg max-w-2xl mx-auto">
              Every business has at least two of these. Most have four.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {failurePoints.map((point) => (
              <div key={point.title} className="card">
                <point.icon className={`${point.color} mb-3`} size={28} />
                <h3 className="font-display font-bold text-lg text-brand-navy mb-2">{point.title}</h3>
                <p className="text-brand-slate text-sm leading-relaxed">{point.description}</p>
              </div>
            ))}
            {/* CTA card */}
            <div className="card bg-brand-teal border-brand-teal text-white flex flex-col justify-between">
              <div>
                <h3 className="font-display font-bold text-lg mb-2">Which ones apply to you?</h3>
                <p className="text-white/80 text-sm mb-4">Take the 3-minute Hiring Score diagnostic and find out exactly where you’re losing candidates and cost.</p>
              </div>
              <Link href="/tools/hiring-score" className="btn-secondary text-sm mt-2 justify-center">
                Get My Score <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The System */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              What the Smart Hiring System™ does
            </h2>
            <p className="text-brand-slate text-lg max-w-xl mx-auto">
              A five-stage methodology. Not a recruitment agency. Not a retainer. A system you own.
            </p>
          </div>
          <div className="space-y-6 max-w-3xl mx-auto">
            {systemSteps.map((step) => (
              <div key={step.step} className="flex gap-6 items-start bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="step-circle bg-brand-teal text-white flex-shrink-0">{step.step}</div>
                <div>
                  <h3 className="font-display font-bold text-lg text-brand-navy mb-1">{step.title}</h3>
                  <p className="text-brand-slate text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section className="section-padding bg-brand-navy text-white">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-6">
                What you walk away with
              </h2>
              <ul className="space-y-3">
                {outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3">
                    <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={20} />
                    <span className="text-white/85">{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/10 rounded-2xl p-8 border border-white/20">
              <p className="text-brand-gold font-semibold text-sm uppercase tracking-widest mb-3">Next step</p>
              <h3 className="font-display text-2xl font-bold mb-4">
                Find out where your hiring is leaking — in 3 minutes.
              </h3>
              <p className="text-white/70 mb-6">
                The Smart Hiring Score gives you an instant breakdown of which of the 5 failure points are active in your business right now.
              </p>
              <Link href="/tools/hiring-score" className="btn-primary w-full justify-center">
                Get Your Free Score <ArrowRight size={18} />
              </Link>
              <p className="text-center text-white/50 text-xs mt-3">No email required to see your score</p>
            </div>
          </div>
        </div>
      </section>

      {/* Hotline CTA */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow text-center">
          <h2 className="font-display text-3xl font-bold text-brand-navy mb-4">
            Already know you have a hiring problem?
          </h2>
          <p className="text-brand-slate text-lg mb-8">
            Skip the diagnostic. Book 15 minutes with Lucinda. Bring the mess — leave with a plan.
          </p>
          <Link href="/book" className="btn-secondary">
            Book the HR Hotline <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </div>
  );
}
