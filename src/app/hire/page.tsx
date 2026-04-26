import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'HIRE Services | Embedded Recruitment and Talent Strategy | The People System',
  description: 'Four HIRE packages: Foundations, Optimiser, Embedded, Build. Embedded recruitment delivery with Friction Lens role scoring, scoped to your hiring volume. The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/hire' },
};

type Package = {
  tag: string;
  highlight: boolean;
  cta: { label: string; href: string };
  name: string;
  who: string;
  includes: string[];
};

const packages: Package[] = [
  {
    tag: 'Starting point · 3-month minimum',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'HIRE Foundations',
    who: 'For teams running occasional senior hires who want expert support without a full embedded commitment. Right for founders hiring sporadically, and for divisions or BUs running their own searches outside a central TA function. We sit alongside the work, not over it.',
    includes: [
      'Friction Lens scoring on every active role',
      'Role definition, market calibration, and brief writing',
      'Interview structure and scorecard templates',
      'Hiring manager and panel guidance',
      'Weekly hiring review with the hiring lead',
      'Placement fee applies at 10% on successful hires',
    ],
  },
  {
    tag: 'Project · Fix the process',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'HIRE Optimiser',
    who: 'For teams whose hiring is not working well. Too slow. Too inconsistent. Too agency-dependent. A fixed-scope engagement to diagnose the failure points and deliver the fix, whether that is one team underperforming or a region, BU, or role family that consistently misses.',
    includes: [
      'Full process audit across the focus area',
      'Friction Lens scoring on up to 10 live roles',
      'Role definition rebuild for priority roles',
      'Interview scorecard suite aligned to internal frameworks',
      'Manager and panel calibration sessions',
      'Written process map with recommendations',
      'Handover pack for internal teams to run going forward',
    ],
  },
  {
    tag: 'Most popular · 6-month minimum',
    highlight: true,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'HIRE Embedded',
    who: 'For teams with a consistent hiring need across a programme, region, or growth phase. We work inside your team: sourcing, screening, advising on decisions, integrating with your ATS, and reporting in to your hiring lead. Placements included in the monthly rate.',
    includes: [
      'Full embedded recruitment delivery against an agreed plan',
      'Friction Lens scoring on every role before launch',
      'Direct sourcing via LinkedIn Recruiter and targeted outreach',
      'Screening and shortlisting to agreed criteria',
      'Interview design and hiring manager support',
      'Offer management and candidate experience',
      'Reporting cadence aligned to your governance',
      'No additional placement fees',
    ],
  },
  {
    tag: 'Scale · 6-month minimum',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'HIRE Build',
    who: 'For teams scaling fast or building a talent function from scratch. We lead delivery while designing the operating model, the tooling, and the capability your in-house team will run after we step back. Right for first-time TA builds and underperforming functions being transformed.',
    includes: [
      'Full delivery leadership across the hiring programme',
      'Friction Lens built into every active role',
      'Employer brand and job ad frameworks',
      'ATS setup, workflow design, and reporting infrastructure',
      'Recruiter onboarding support if building an in-house team',
      'Hiring manager training programme',
      'Talent market intelligence reporting',
      'Steering or leadership engagement throughout',
    ],
  },
];

export default function HirePage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                HIRE: Services and Pricing
              </p>
              <h1
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                  fontWeight: 800,
                  lineHeight: 1.02,
                  letterSpacing: '-0.04em',
                  color: 'var(--ink)',
                }}
              >
                Four ways to work with us<br />
                <span className="text-gradient">on your hiring.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                Every HIRE engagement starts with Friction Lens: a role scoring system that tells you exactly where each vacancy will struggle before it goes to market. From there, the right package depends on your hiring volume and how broken the current process is.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                Not sure which one fits? Start with a free hiring audit. One conversation with us. You will leave with a clear picture of what is broken and which engagement model makes sense.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="/smart-hiring-system" className="btn-secondary">
                  How HIRE works
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=960&h=960&fit=crop&crop=faces"
                  alt="Professional on a phone call discussing hiring"
                  fill
                  className="object-cover"
                  sizes="420px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Friction Lens callout */}
      <section style={{ background: 'var(--surface)', padding: '2.5rem 1.5rem' }} className="lg:px-10">
        <div className="container-narrow">
          <div className="rounded-[18px] p-8 flex flex-col sm:flex-row gap-6 items-start" style={{ background: 'linear-gradient(135deg, rgba(123,47,190,0.08), rgba(75,110,245,0.08))', border: '1px solid rgba(123,47,190,0.15)' }}>
            <div className="flex-1">
              <p className="eyebrow mb-2" style={{ color: 'var(--brand-purple)' }}>Built into every engagement</p>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Friction Lens scores every role<br />
                <span className="text-gradient">before it goes live</span>
              </h3>
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
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h3
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--ink)',
              }}
            >
              HIRE <span className="text-gradient">packages</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Every package includes Friction Lens scoring as standard. Each engagement is scoped to the size and shape of your organisation. Talk to us about which one fits and we will shape the detail.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {packages.map((pkg) => (
              <PackageCard key={pkg.name} pkg={pkg} />
            ))}
          </div>
        </div>
      </section>

      {/* Not sure section */}
      <section style={{ background: 'var(--surface-alt)', padding: '3rem 1.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <h3
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: 'var(--ink)',
                }}
              >
                Not sure<br />
                <span className="text-gradient">which package fits?</span>
              </h3>
              <p className="text-lg mb-8 max-w-xl" style={{ color: 'var(--ink-soft)' }}>
                Start with a hiring audit. We will look at what you are hiring for, how the current process is working, run a Friction Lens score on a live role, and tell you exactly which engagement makes sense.
              </p>
              <Link href="/book" className="btn-gradient">Book a Call</Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image
                  src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=960&h=960&fit=crop&crop=faces"
                  alt="Team collaborating on hiring strategy"
                  fill
                  className="object-cover"
                  sizes="420px"
                />
                {/* Quote overlay */}
                <div
                  className="absolute inset-x-0 bottom-0 p-6"
                  style={{
                    background: 'linear-gradient(to top, rgba(5,8,16,0.88) 0%, rgba(5,8,16,0.45) 60%, transparent 100%)',
                  }}
                >
                  <p className="text-white text-sm leading-relaxed mb-2" style={{ fontStyle: 'italic', opacity: 0.95 }}>
                    &ldquo;Not HR from a textbook. People results from operators who have done the real work.&rdquo;
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Lucy &amp; Tom, The People System
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'What is the minimum commitment?', a: 'Hire Foundations and Hire Optimiser have a 3-month minimum. Hire Embedded and Hire Build have a 6-month minimum. Hire Optimiser can also be scoped as a one-off engagement with no ongoing commitment.' },
        { q: 'Are placement fees on top of the monthly rate?', a: 'For Hire Foundations: yes, 10% on each successful placement. For Hire Embedded and Hire Build: no: placements are included within the monthly rate. For Hire Optimiser: a reduced placement fee applies if roles are filled during the engagement.' },
        { q: 'What is Friction Lens and is it included?', a: 'Friction Lens is a role scoring technology developed by IvyLens Technology. It assesses every active role across five dimensions: Location, Salary, Skills, Working Model, and Process: against live market data and produces a friction score (Low to Critical) with specific recommendations. It is integrated into every HIRE package as standard.' },
        { q: 'Can we start on just one role?', a: 'Yes. Hire Foundations works well for businesses with one or two live roles who want structured support without a full embedded commitment.' },
        { q: 'Do you replace our existing recruiters or agencies?', a: 'We typically work alongside your existing setup in the first instance: auditing the current process, reducing agency dependency over time, and building internal capability. Many clients reduce or eliminate their agency spend within 6-12 months of working with us.' },
      ]} />

    </div>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  const highlight = pkg.highlight;
  return (
    <div
      className="rounded-[22px] p-8 flex flex-col h-full"
      style={highlight
        ? { background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff', boxShadow: '0 8px 40px rgba(123,47,190,0.25)' }
        : { background: 'var(--surface)', border: '1px solid var(--brand-line)' }
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3
          className="font-bold text-2xl"
          style={{ color: highlight ? '#fff' : 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {pkg.name}
        </h3>
        <span
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={highlight
            ? { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }
            : { background: 'var(--bg)', color: 'var(--ink-soft)', border: '1px solid var(--brand-line)' }
          }
        >
          {pkg.tag}
        </span>
      </div>
      <p
        className="text-sm leading-relaxed mb-6"
        style={{ color: highlight ? 'rgba(255,255,255,0.85)' : 'var(--ink-soft)' }}
      >
        {pkg.who}
      </p>
      <ul className="space-y-2 mb-8">
        {pkg.includes.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <CheckCircle
              className="flex-shrink-0 mt-0.5"
              size={15}
              style={{ color: highlight ? 'rgba(255,255,255,0.7)' : 'var(--brand-purple)' }}
            />
            <span
              className="text-sm"
              style={{ color: highlight ? 'rgba(255,255,255,0.85)' : 'var(--ink-soft)' }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <Link
          href={pkg.cta.href}
          className={highlight ? 'btn-outline-white w-full justify-center' : 'btn-gradient w-full justify-center'}
        >
          {pkg.cta.label} <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
