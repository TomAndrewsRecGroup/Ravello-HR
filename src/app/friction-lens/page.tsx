import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, MapPin, PoundSterling, Layers, Monitor, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Friction Lens | Role Scoring Before You Go to Market | The People System',
  description: 'Before a role goes live, you should know where it will struggle. Friction Lens scores every vacancy across five dimensions and tells you exactly what to fix before you recruit.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/friction-lens' },
};

const dimensions = [
  {
    icon: MapPin,
    name: 'Location',
    color: '#7B2FBE',
    description: 'Candidate pool density versus commutable distance. Remote, hybrid, or office: how does your requirement compare to what candidates in this role type actually expect?',
    examples: ['Office-only in a location with a thin commutable pool', 'Role requiring relocation when market norm is remote', 'Multi-site requirement when candidates expect single location'],
  },
  {
    icon: PoundSterling,
    name: 'Salary',
    color: '#4B6EF5',
    description: 'Competitiveness against live market rates for the specific role type, seniority, and location. Not last year\'s benchmarks. The market as it is right now.',
    examples: ['Salary 15–20% below live market rate', 'Range too narrow for the seniority expected', 'No benchmarking done since previous hire in this role'],
  },
  {
    icon: Layers,
    name: 'Skills',
    color: '#E04898',
    description: 'Stack complexity and rare combinations. How many of your must-haves are genuinely must-haves? And how many are narrowing your pool without improving your hire quality?',
    examples: ['Five must-haves where two are rare to find together', 'Technical stack combination that limits pool to under 200 candidates nationally', 'Nice-to-haves written as requirements'],
  },
  {
    icon: Monitor,
    name: 'Working Model',
    color: '#2E8B7A',
    description: 'Office, hybrid, or remote: and how that compares to the market norm for this specific role type. The gap between your expectation and candidate expectation is often the biggest source of friction.',
    examples: ['5-days office when market norm for role is 2–3 days hybrid', 'No flexibility stated when competitors offer full remote', 'Policy inconsistency between advertised model and manager expectation'],
  },
  {
    icon: Clock,
    name: 'Process',
    color: '#B45309',
    description: 'Interview stages versus market norm, time-to-offer estimate, and an early read on how long this role is likely to take. A six-stage process for a mid-level hire loses candidates at stage three.',
    examples: ['Four-stage process for a role where market norm is two', 'No timeline given to candidates, driving drop-off', 'Technical test at stage one before any human conversation'],
  },
];

const scoreLevels = [
  {
    level: 'Low',
    colour: '#16A34A',
    bg: 'rgba(22,163,74,0.08)',
    border: 'rgba(22,163,74,0.2)',
    meaning: 'Role is well-positioned against current market. Proceed to market with confidence. Minor improvements may be flagged but none are blocking.',
  },
  {
    level: 'Medium',
    colour: '#D97706',
    bg: 'rgba(217,119,6,0.08)',
    border: 'rgba(217,119,6,0.2)',
    meaning: '1–2 friction points identified. Specific recommendations provided. Addressable changes recommended before going live. Role can proceed with adjustments.',
  },
  {
    level: 'High',
    colour: '#DC2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.2)',
    meaning: 'Multiple friction points. Role needs meaningful revision before launch. Proceeding as-is significantly reduces your candidate pool and increases time-to-fill.',
  },
  {
    level: 'Critical',
    colour: '#7F1D1D',
    bg: 'rgba(127,29,29,0.08)',
    border: 'rgba(127,29,29,0.25)',
    meaning: 'Role will fail to market as-is. Strategic review required before any recruitment activity. Typically involves at least two major friction points with no straightforward fix.',
  },
];

export default function FrictionLensPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Friction Lens: built by Tom Andrews · IvyLens Technology
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
            Before a role goes live, you should know<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              where it will struggle.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Most businesses launch roles and then discover the problems. Wrong salary. Wrong location requirement. Too many must-haves. A process so slow that every strong candidate has accepted elsewhere before you reach offer stage.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Friction Lens scores every active role across five dimensions before it goes to market. You see the friction score, the specific failure points, and exactly what to change. Not after four weeks of wasted effort. Before day one.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              See it in action: Start with a Hiring Audit <ArrowRight size={16} />
            </Link>
            <Link href="/hire" className="btn-secondary">
              HIRE packages
            </Link>
          </div>
        </div>
      </section>

      {/* Competitive positioning */}
      <section className="section-sm" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow">
          <div className="rounded-[18px] p-8" style={{ background: 'linear-gradient(135deg, rgba(123,47,190,0.06), rgba(75,110,245,0.06))', border: '1px solid rgba(123,47,190,0.15)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--brand-purple)' }}>Why it matters</p>
            <h2 className="font-bold text-xl mb-4" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
              No SME-accessible tool offers this. Now one does.
            </h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-soft)' }}>
              Enterprise systems like Gartner TalentNeuron and LinkedIn Talent Insights give large businesses live market intelligence against job roles. They cost £50,000+/year and require a dedicated analyst to operate. They are not built for businesses hiring 3–20 roles a year.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Friction Lens brings the same principle to founder-led and PE-backed businesses: role-level market intelligence, pre-launch, built into every HIRE engagement from day one. No enterprise contract required.
            </p>
          </div>
        </div>
      </section>

      {/* Five dimensions */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="font-display section-title mb-4">Five dimensions. One score.</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Every role is assessed across five areas. Each one scored independently. Combined into a single Friction Score with specific, actionable recommendations attached.
            </p>
          </div>
          <div className="space-y-6">
            {dimensions.map((dim, i) => (
              <div key={dim.name} className="rounded-[22px] p-8" style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}>
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="flex items-start gap-5 flex-1">
                    <div
                      className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0"
                      style={{ background: `${dim.color}15`, border: `1px solid ${dim.color}30` }}
                    >
                      <dim.icon size={22} style={{ color: dim.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-bold" style={{ color: 'var(--ink-faint)' }}>0{i + 1}</span>
                        <h3 className="font-bold text-xl" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.35rem', letterSpacing: '-0.015em' }}>
                          {dim.name}
                        </h3>
                      </div>
                      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-soft)' }}>{dim.description}</p>
                    </div>
                  </div>
                  <div className="lg:w-64 flex-shrink-0">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-faint)' }}>Common friction examples</p>
                    <ul className="space-y-2">
                      {dim.examples.map((ex) => (
                        <li key={ex} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: dim.color }} />
                          <span className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{ex}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score levels */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="font-display section-title mb-4">What the score output looks like</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Four levels. Each one comes with a written summary of which dimensions are driving the score and specific recommended changes: not generic advice.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {scoreLevels.map((s) => (
              <div
                key={s.level}
                className="rounded-[18px] p-6"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}
              >
                <div
                  className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-4"
                  style={{ background: s.colour, color: '#fff', letterSpacing: '0.03em' }}
                >
                  {s.level} Friction
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{s.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works in practice */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-narrow">
          <h2 className="font-display section-title mb-8">How it works in a HIRE engagement</h2>
          <div className="space-y-5">
            {[
              { step: '01', title: 'Role brief received', body: 'Tom receives the initial brief: either written or via a scoping call. Job title, location, salary range, key requirements, working model, and intended timeline.' },
              { step: '02', title: 'Friction Lens scoring run', body: 'Each of the five dimensions is assessed against live market data for the specific role type and geography. The Friction Lens platform, developed by IvyLens Technology, is applied with Tom\'s direct market knowledge to produce a scored output.' },
              { step: '03', title: 'Score and recommendations delivered', body: 'You receive a written Friction Lens report: overall score, dimension-by-dimension breakdown, and specific recommendations for anything rated Medium or above. Typically returned within 24 hours of briefing.' },
              { step: '04', title: 'Role revised if needed', body: 'Where friction points are High or Critical, Tom works with you to address them before the role goes live: salary adjustment, brief rework, process redesign. Changes made at this stage save weeks.' },
              { step: '05', title: 'Role goes to market correctly', body: 'Role launches with a Friction Lens score of Low or Medium. Correct salary. Right working model expectation set. Realistic must-have list. Tight, fast process designed from day one.' },
            ].map((step) => (
              <div key={step.step} className="flex gap-6 items-start">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                  style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', color: 'var(--brand-purple)' }}
                >
                  {step.step}
                </div>
                <div className="pt-1.5">
                  <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA: dark */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className="font-display section-title-light mb-4">Ready to see it on a live role?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Start with a hiring audit. Tom will run a Friction Lens score on one of your current or upcoming roles and walk you through the output. Free. No obligation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-gradient">
              See it in action <ArrowRight size={16} />
            </Link>
            <Link href="/hire" className="btn-outline-white">
              HIRE packages and pricing
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'Who built Friction Lens?', a: 'Friction Lens was built by Tom Andrews through IvyLens Technology: the technology company Tom founded alongside Andrews Recruitment Group, RecXchange, and AMIVY Designs. The People System integrates Friction Lens into every HIRE engagement, applied by Tom with direct market knowledge to score each role before it goes live.' },
        { q: 'Is Friction Lens automated or manual?', a: 'Friction Lens is a structured scoring framework developed by IvyLens Technology. The value is in how it is applied: Tom uses it with direct market knowledge to interpret why a salary range is problematic for this specific role in this specific geography, not just flag that it is below average.' },
        { q: 'How long does a Friction Lens score take?', a: 'Typically delivered within 24 hours of receiving a full role brief. Complex or specialist roles may take 48 hours.' },
        { q: 'Is it included in all HIRE packages?', a: 'Yes. Friction Lens scoring is built into every HIRE engagement as standard: Foundations, Optimiser, Embedded, and Build.' },
        { q: 'Can we get a standalone Friction Lens score without a full HIRE engagement?', a: 'A Friction Lens score is included as part of a free hiring audit. Book a call and Tom will score one live role for you.' },
        { q: 'What happens if a role comes back Critical?', a: 'Tom will work with you to address the specific friction points before the role goes to market. This typically involves salary repositioning, working model negotiation, or a brief rewrite. Roles that launch at Critical rarely fill without significant rework anyway: better to do it upfront.' },
      ]} />

    </div>
  );
}
