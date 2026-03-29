import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, XCircle, TrendingDown, Clock, PoundSterling, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'HIRE | Fix Your Hiring Before It Costs You | The People System',
  description: 'Your hiring is broken. We fix it before it costs you. Embedded recruitment delivery, talent strategy, and Friction Lens role scoring: The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/smart-hiring-system' },
};

const failurePoints = [
  { icon: XCircle,       title: 'Roles defined wrong from the start',  description: 'Most briefs describe the last person in the job, not what the business actually needs. You attract the wrong people and wonder why the shortlist is always weak.',          colorClass: 'text-red-500'    },
  { icon: TrendingDown,  title: 'Inconsistent hiring managers',        description: 'No structure. No scorecard. Three interviewers with three different agendas. The strongest candidate loses out to whoever interviewed best on the day.',                  colorClass: 'text-orange-500' },
  { icon: Clock,         title: 'A process that moves too slowly',     description: 'Strong candidates are gone within seven days. If your process takes six weeks, you are not competing for the same talent pool.',                                   colorClass: 'text-yellow-600' },
  { icon: PoundSterling, title: 'Permanent agency dependency',         description: 'Every role above a certain level goes to an agency. No internal capability is built. The fee bill just keeps growing.',                                       colorClass: 'text-red-600'    },
  { icon: Users,         title: 'High friction roles go to market blind', description: 'A role with the wrong salary, wrong location requirement, or too many must-haves will fail: but only after weeks of wasted effort. Friction Lens catches this before you go live.',                              colorClass: 'text-purple-500' },
];

const systemSteps = [
  { step: '01', title: 'Friction Lens scoring',       description: 'Before any role goes live, we score it. Friction Lens assesses your role across five dimensions: Location, Salary, Skills, Working Model, and Process: against live market data. You see exactly where it will struggle and what to fix before you spend a day recruiting.' },
  { step: '02', title: 'Role definition',              description: 'Better role definition. We rebuild the brief around what the business actually needs: outcomes, not a wish list. Attracts the right people. Filters the wrong ones before interview stage.' },
  { step: '03', title: 'Faster process',               description: 'Faster process. We map your timeline against where candidates drop off and cut the steps that add delay without adding signal. Strong candidates will not wait six weeks.' },
  { step: '04', title: 'Higher quality hires',         description: 'Higher quality hires. Structured scorecards for every interview stage. Every hiring manager scoring the same criteria. Gut feel becomes a tiebreaker, not the deciding vote.' },
  { step: '05', title: 'Embedded delivery',            description: 'We recruit alongside you, not instead of you. Depending on the package, Tom embeds directly into your hiring process: sourcing, screening, advising: building internal capability as we go.' },
];

const outcomes = [
  'Roles scored against live market data before they go live: no more blind launches',
  'Better role definitions that attract the right people from day one',
  'A faster process that keeps strong candidates engaged',
  'Hiring managers who interview with structure, not instinct',
  'Reduced agency dependency on repeatable roles',
  'Higher offer acceptance and better retention at 12 months',
];

export default function SmartHiringSystemPage() {
  return (
    <div className="pt-28">

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            HIRE: The People System
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              fontWeight: 300,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              marginBottom: '1.25rem',
            }}
          >
            Your hiring is broken.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              We fix it before it costs you.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Agency fees on repeat. Bad hires. Roles that keep coming back. Managers who have never been taught to interview. The problem is not the talent market. It is the process: and the fact that no one has fixed it properly.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Before any role goes live, we score it. Friction Lens tells you exactly where it will struggle and what to fix. Then we deliver: embedded alongside your team, building capability that lasts beyond the engagement.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Start with a Hiring Audit <ArrowRight size={16} />
            </Link>
            <Link href="/book" className="btn-secondary">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      {/* Failure points */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">The 5 reasons<br /><span className="text-gradient">your hiring keeps failing</span></h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Every business we talk to has at least two of these. Most have four.</p>
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
                <h3 className="font-bold text-lg mb-2">Know which ones apply to you?</h3>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.8)' }}>Book a hiring audit. We will tell you exactly where the process is breaking down and what it is costing you.</p>
              </div>
              <Link href="/book" className="btn-outline-white text-sm mt-2 justify-center">
                Start with a Hiring Audit <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The System steps */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="section-title mb-4">How<br /><span className="text-gradient">HIRE works</span></h2>
            <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
              Five stages. Better role definition. Faster process. Higher quality hires. And Friction Lens running before every role goes live.
            </p>
          </div>
          <div className="space-y-5 max-w-3xl mx-auto">
            {systemSteps.map((step) => (
              <div key={step.step} className="flex gap-6 items-start bg-white rounded-[18px] p-6" style={{ border: '1px solid var(--brand-line)', boxShadow: '0 2px 8px rgba(13,21,53,0.04)' }}>
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)' }}
                >
                  {step.step}
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes: dark section, intentional anchor */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title-light mb-6">What changes<br /><span style={{ background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>when HIRE is working</span></h2>
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
              <h3 className="font-bold text-xl mb-4 text-white" style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: '1.6rem' }}>
                Start with a hiring audit. Find out exactly what is broken.
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                We will look at your current process, score a live or recent role through Friction Lens, and give you a clear picture of what needs fixing and in what order.
              </p>
              <Link href="/book" className="btn-gradient w-full justify-center">
                Start with a Hiring Audit <ArrowRight size={16} />
              </Link>
              <p className="text-center text-xs mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Free · No obligation · Typically 30 minutes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Hotline CTA */}
      <section className="section-sm" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title mb-4">Already know<br /><span className="text-gradient">your hiring needs fixing?</span></h2>
          <p className="text-lg mb-8" style={{ color: 'var(--ink-soft)' }}>
            Skip the audit. Book 30 minutes with Tom. Bring the role or the challenge and leave with a clear plan.
          </p>
          <Link href="/book" className="btn-gradient">
            Book a Call about HIRE <ArrowRight size={16} />
          </Link>
        </div>
      </section>


      {/* FAQ */}
      <FaqBlock
        items={[
          { q: 'What is Friction Lens?', a: 'Friction Lens is a role scoring technology developed by IvyLens Technology. It scores every role across five dimensions: Location, Salary, Skills, Working Model, and Process: before it goes live, telling you exactly where the role will struggle and giving you specific recommendations to fix it. Low, Medium, High, or Critical friction. Integrated into every HIRE engagement as standard.' },
          { q: 'What HIRE packages do you offer?', a: 'Hire Foundations (£1,000/month + 10% fee, 3-month minimum), Hire Optimiser (£2,500 one-off or £1,500/month x 3), Hire Embedded (£5,000/month, 6-month minimum, fees included), and Hire Build (£6,500–£8,500+/month, 6-month minimum). Full details on the services page.' },
          { q: 'Who is HIRE for?', a: 'Founder-led businesses scaling 20–150 people, VC or PE-backed businesses post-raise, and any business with a history of bad hires, rising agency spend, or inconsistent hiring managers.' },
          { q: 'Do we need to use a recruitment agency?', a: 'No. HIRE is designed to reduce agency dependency by building internal sourcing capability and fixing the process so you do not need to outsource everything.' },
          { q: 'How quickly can you start?', a: 'Typically within 48 hours of scoping. Tom embeds fast: no lengthy discovery phase. We learn your business by working inside it.' },
        ]}
      />

    </div>
  );
}
