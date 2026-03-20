import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, XCircle, TrendingDown, Clock, PoundSterling, Users } from 'lucide-react';
import ProductHeroElevated from '@/components/ProductHeroElevated';
import SystemStepsElevated from '@/components/SystemStepsElevated';

export const metadata: Metadata = {
  title: 'Smart Hiring System™ | Fix Hiring Drift | Ravello HR',
  description: 'Stop reopening roles. Cut agency spend. The Smart Hiring System™ by Ravello HR fixes the 5 failure points where most hiring falls apart.',
  alternates: { canonical: 'https://ravellohr.co.uk/smart-hiring-system' },
};

const failurePoints = [
  { icon: XCircle,       title: 'Vague role definitions',   description: 'Hiring managers describe the person they last worked with, not the role they actually need. You interview the wrong people for months.',          colorClass: 'text-red-500'    },
  { icon: TrendingDown,  title: 'Inconsistent assessment',  description: 'No scorecard. No structure. Three interviewers, three different opinions. The best candidate loses to the most confident one.',                  colorClass: 'text-orange-500' },
  { icon: Clock,         title: 'Decision speed',           description: 'Good candidates are gone in 7 days. Your process takes 6 weeks. You wonder why offers keep getting declined.',                                   colorClass: 'text-yellow-600' },
  { icon: PoundSterling, title: 'Agency dependency',        description: 'Every hard role goes straight to an agency. No internal capability built. The fee bill grows every year.',                                       colorClass: 'text-red-600'    },
  { icon: Users,         title: 'Offer drop-off',           description: 'Candidates accept then ghost. Or join and leave within 90 days. The root cause is always earlier in the process.',                              colorClass: 'text-purple-500' },
];

const systemSteps = [
  { step: '01', title: 'Role Architecture',       description: 'Define the role around outcomes, not a wish list. We build a role brief that attracts the right people and filters the wrong ones before you spend a minute interviewing.' },
  { step: '02', title: 'Assessment Design',        description: 'A structured scorecard for every stage. Every interviewer scores the same criteria. Gut feel becomes a tiebreaker, not the deciding vote.' },
  { step: '03', title: 'Process Velocity',         description: 'Map your hiring timeline against where candidates drop. We cut steps that add delay without adding signal — typically halving time-to-offer.' },
  { step: '04', title: 'Manager Enablement',       description: 'Train hiring managers to interview with intent. Scripts, red flags, scoring guidance. One session. Permanent improvement.' },
  { step: '05', title: 'Offer & Onboarding Bridge',description: 'The gap between offer and day one is where candidates change their minds. We close it with structured pre-boarding that makes joining a no-brainer.' },
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
    <div>
      {/* Elevated hero */}
      <ProductHeroElevated
        eyebrow="Smart Hiring System™"
        title="Stop reopening the same roles."
        subtitle="Cut agency spend. Build internal capability. Make better hires."
        description="Most businesses rely on instinct when hiring. The Smart Hiring System™ fixes the 5 failure points where hiring falls apart — giving you a structure that works, every time."
        ctaText="Schedule a consultation"
      />

      {/* Failure points */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">The 5 places your hiring is leaking</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Every business has at least two of these. Most have four.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {failurePoints.map((point) => (
              <div key={point.title} className="card">
                <point.icon className={`${point.colorClass} mb-3`} size={26} />
                <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{point.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{point.description}</p>
              </div>
            ))}
            <div className="rounded-[18px] p-7 flex flex-col justify-between" style={{ background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff' }}>
              <div>
                <h3 className="font-bold text-lg mb-2">Which ones apply to you?</h3>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.8)' }}>Take the 3-minute Hiring Score diagnostic and find out exactly where you're losing candidates and cost.</p>
              </div>
              <Link href="/tools/hiring-score" className="btn-outline-white text-sm mt-2 justify-center">
                Get My Score <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The System steps — elevated */}
      <SystemStepsElevated steps={systemSteps} />

      {/* Outcomes — dark section, intentional anchor */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title-light mb-6">What you walk away with</h2>
              <ul className="space-y-3">
                {outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3">
                    <CheckCircle className="flex-shrink-0 mt-0.5" size={18} style={{ color: '#9B6FD8' }} />
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[18px] p-8" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(155,111,216,0.9)' }}>Next step</p>
              <h3 className="font-bold text-xl mb-4 text-white" style={{ fontFamily: 'var(--font-playfair), serif', fontWeight: 700, fontSize: '1.6rem' }}>
                Find out where your hiring is leaking — in 3 minutes.
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                The Smart Hiring Score gives you an instant breakdown of which of the 5 failure points are active in your business right now.
              </p>
              <Link href="/tools/hiring-score" className="btn-gradient w-full justify-center">
                Get Your Free Score <ArrowRight size={16} />
              </Link>
              <p className="text-center text-xs mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>No email required to see your score</p>
            </div>
          </div>
        </div>
      </section>

      {/* Hotline CTA */}
      <section className="section-sm" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title mb-4">Already know you have a hiring problem?</h2>
          <p className="text-lg mb-8" style={{ color: 'var(--ink-soft)' }}>
            Skip the diagnostic. Book 15 minutes with Lucinda. Bring the mess — leave with a plan.
          </p>
          <Link href="https://calendly.com/ravellohr/free-consultation" target="_blank" rel="noopener noreferrer" className="btn-gradient">
            Book the HR Hotline <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock
        items={[
          { q: 'What is the Smart Hiring System?', a: 'A structured five-stage methodology that fixes the root causes of hiring failure — vague role definitions, inconsistent assessment, slow decisions, agency dependency, and offer drop-off.' },
          { q: 'Who is it for?', a: 'Businesses that reopen the same roles repeatedly, overspend on agencies, or struggle to get consistent hiring decisions from their management team.' },
          { q: 'How long does it take?', a: 'Most engagements take four to eight weeks depending on the number of roles and complexity of the existing process.' },
          { q: 'What do we walk away with?', a: 'A reusable system — role brief templates, assessment scorecards, interview guides, and onboarding frameworks — that your team owns and can run independently.' },
          { q: 'Do we need to use a recruitment agency?', a: 'No. The system is designed to reduce agency dependency by building internal sourcing capability over time.' },
        ]}
      />
    </div>
  );
}
