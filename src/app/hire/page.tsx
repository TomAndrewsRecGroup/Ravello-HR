import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'HIRE Services | Embedded Recruitment and Talent Strategy | The People System',
  description: 'Four HIRE packages: Hire Foundations, Hire Optimiser, Hire Embedded, Hire Build. Embedded recruitment delivery with Friction Lens role scoring: The People System.',
  alternates: { canonical: 'https://ravellohr.co.uk/hire' },
};

const packages = [
  {
    name: 'Hire Foundations',
    tag: 'Starting point · 3-month minimum',
    price: '£1,000/month + 10% placement fee',
    highlight: false,
    who: 'For founder-led businesses that are hiring sporadically and want an expert involved without a full embedded commitment. You need someone who can advise on the role, review the process, and make sure the basics are right.',
    includes: [
      'Friction Lens scoring on every active role',
      'Role definition review and brief writing',
      'Interview structure and scorecard templates',
      'Hiring manager guidance',
      'Weekly hiring review (30 min)',
      'Placement fee applies at 10% on successful hires',
    ],
    cta: { label: 'Book a Call', href: '/book' },
  },
  {
    name: 'Hire Optimiser',
    tag: 'Project · Fix the process',
    price: '£2,500 one-off, or £1,500/month × 3',
    highlight: false,
    who: 'For businesses that have a hiring process but it is not working well. Too slow. Too inconsistent. Too dependent on agencies. This is a fixed-scope engagement to find and fix the specific failure points.',
    includes: [
      'Full hiring process audit',
      'Friction Lens scoring on up to 3 live roles',
      'Role definition rebuild (up to 3 roles)',
      'Interview scorecard suite',
      'Manager interview training session',
      'Written process map with recommendations',
      'Reduced placement fee if additional roles filled during engagement',
    ],
    cta: { label: 'Book a Scoping Call', href: '/book' },
  },
  {
    name: 'Hire Embedded',
    tag: 'Most popular · 6-month minimum',
    price: '£5,000/month · fees included in scope',
    highlight: true,
    who: 'For businesses with a consistent hiring need: typically 3–8 roles over the engagement period. Tom works inside your team: sourcing, screening, advising on decisions, and building capability as you go. Agency fees are included in the monthly rate.',
    includes: [
      'Full embedded recruitment delivery',
      'Friction Lens scoring on every role before launch',
      'Direct sourcing via LinkedIn Recruiter and targeted outreach',
      'Screening and shortlisting to agreed criteria',
      'Interview design and hiring manager support',
      'Offer management and candidate experience',
      'No additional placement fees',
      'Internal capability building throughout',
    ],
    cta: { label: 'Start with a Hiring Audit', href: '/book' },
  },
  {
    name: 'Hire Build',
    tag: 'Scale · 6-month minimum',
    price: '£6,500–£8,500+/month',
    highlight: false,
    who: 'For businesses scaling rapidly: typically 8+ roles at a time, or preparing to build a people function from scratch. Tom leads the talent function end-to-end, builds the internal infrastructure, and designs the process your in-house team will eventually run independently.',
    includes: [
      'Full talent function leadership',
      'Friction Lens built into every active role',
      'Employer brand development and job ad frameworks',
      'ATS setup and hiring workflow design',
      'Recruiter hiring and onboarding support (if building in-house team)',
      'Hiring manager training programme',
      'Talent market intelligence reporting',
      'Direct line to Tom throughout',
    ],
    cta: { label: 'Book a Call', href: '/book' },
  },
];

export default function HirePage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            HIRE: Services and Pricing
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
            Four ways to work with Tom<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              on your hiring.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Every HIRE engagement starts with Friction Lens: a role scoring system that tells you exactly where each vacancy will struggle before it goes to market. From there, the right package depends on your hiring volume and how broken the current process is.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Not sure which one fits? Start with a free hiring audit. Thirty minutes with Tom. You will leave with a clear picture of what is broken and which engagement model makes sense.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Start with a Hiring Audit <ArrowRight size={16} />
            </Link>
            <Link href="/smart-hiring-system" className="btn-secondary">
              How HIRE works
            </Link>
          </div>
        </div>
      </section>

      {/* Friction Lens callout */}
      <section className="section-sm" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow">
          <div className="rounded-[18px] p-8 flex flex-col sm:flex-row gap-6 items-start" style={{ background: 'linear-gradient(135deg, rgba(123,47,190,0.08), rgba(75,110,245,0.08))', border: '1px solid rgba(123,47,190,0.15)' }}>
            <div className="flex-1">
              <p className="eyebrow mb-2" style={{ color: 'var(--brand-purple)' }}>Built into every engagement</p>
              <h2 className="font-bold text-xl mb-3" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.4rem' }}>
                Friction Lens scores every role before it goes live
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                Five dimensions: Location, Salary, Skills, Working Model, and Process: scored against live market data. Low, Medium, High, or Critical friction. Specific recommendations attached. No more blind launches.
              </p>
            </div>
            <Link href="/friction-lens" className="btn-secondary flex-shrink-0 self-start">
              Learn more <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">HIRE<br /><span className="text-gradient">packages</span></h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              All packages include Friction Lens scoring as standard. No tables: here is what each one means in practice.
            </p>
          </div>
          <div className="space-y-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className="rounded-[22px] p-8"
                style={pkg.highlight
                  ? { background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff', boxShadow: '0 8px 40px rgba(123,47,190,0.25)' }
                  : { background: 'var(--surface)', border: '1px solid var(--brand-line)' }
                }
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3
                        className="font-bold text-2xl"
                        style={{ color: pkg.highlight ? '#fff' : 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, letterSpacing: '-0.02em' }}
                      >
                        {pkg.name}
                      </h3>
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={pkg.highlight
                          ? { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }
                          : { background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--brand-line)' }
                        }
                      >
                        {pkg.tag}
                      </span>
                    </div>
                    <p
                      className="font-bold text-lg mb-4"
                      style={{ color: pkg.highlight ? 'rgba(255,255,255,0.9)' : 'var(--brand-purple)' }}
                    >
                      {pkg.price}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-6"
                      style={{ color: pkg.highlight ? 'rgba(255,255,255,0.8)' : 'var(--ink-soft)' }}
                    >
                      {pkg.who}
                    </p>
                    <ul className="space-y-2">
                      {pkg.includes.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <CheckCircle
                            className="flex-shrink-0 mt-0.5"
                            size={15}
                            style={{ color: pkg.highlight ? 'rgba(255,255,255,0.7)' : 'var(--brand-purple)' }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: pkg.highlight ? 'rgba(255,255,255,0.8)' : 'var(--ink-soft)' }}
                          >
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="lg:w-48 flex-shrink-0">
                    <Link
                      href={pkg.cta.href}
                      className={pkg.highlight ? 'btn-outline-white w-full justify-center' : 'btn-gradient w-full justify-center'}
                    >
                      {pkg.cta.label} <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Not sure section */}
      <section className="section-sm" style={{ background: 'var(--surface-alt)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title mb-4">Not sure<br /><span className="text-gradient">which package fits?</span></h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Start with a hiring audit. Tom will look at what you are hiring for, how the current process is working, run a Friction Lens score on a live role, and tell you exactly which engagement makes sense.
          </p>
          <Link href="/book" className="btn-gradient">
            Book a Free Hiring Audit <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'What is the minimum commitment?', a: 'Hire Foundations and Hire Optimiser have a 3-month minimum. Hire Embedded and Hire Build have a 6-month minimum. For Hire Optimiser, the one-off option (£2,500) has no ongoing commitment.' },
        { q: 'Are placement fees on top of the monthly rate?', a: 'For Hire Foundations: yes, 10% on each successful placement. For Hire Embedded and Hire Build: no: placements are included within the monthly rate. For Hire Optimiser: a reduced placement fee applies if roles are filled during the engagement.' },
        { q: 'What is Friction Lens and is it included?', a: 'Friction Lens is a role scoring technology developed by IvyLens Technology. It assesses every active role across five dimensions: Location, Salary, Skills, Working Model, and Process: against live market data and produces a friction score (Low to Critical) with specific recommendations. It is integrated into every HIRE package as standard.' },
        { q: 'Can we start on just one role?', a: 'Yes. Hire Foundations works well for businesses with one or two live roles who want structured support without a full embedded commitment.' },
        { q: 'Do you replace our existing recruiters or agencies?', a: 'Tom typically works alongside your existing setup in the first instance: auditing the current process, reducing agency dependency over time, and building internal capability. Many clients reduce or eliminate their agency spend within 6–12 months of working with Tom.' },
      ]} />

    </div>
  );
}
