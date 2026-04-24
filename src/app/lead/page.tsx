import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'LEAD Services | Fractional People Leadership | The People System',
  description: 'Four LEAD packages: Lead Foundations, Lead Optimiser, Lead Partner, Lead Build. Fractional HR leadership and manager enablement: The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/lead' },
};

type Variant = {
  who: string;
  includes: string[];
};

type Package = {
  name: string;
  tag: string;
  highlight: boolean;
  cta: { label: string; href: string };
  sme: Variant;
  corporate: Variant;
};

const packages: Package[] = [
  {
    name: 'Lead Foundations',
    tag: 'Starting point · ongoing',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      who: 'For businesses that need a senior HR voice available on a regular basis: someone to call when a people question comes up, to sanity-check decisions, and to prevent small issues from becoming expensive ones. Not a full fractional engagement. A reliable floor.',
      includes: [
        'Monthly strategic HR check-in (60 min)',
        'Ad-hoc advice on people decisions and live situations',
        'Manager guidance on individual cases',
        'Access to us via email between sessions',
        'Escalation to higher packages where a situation requires it',
      ],
    },
    corporate: {
      who: 'For corporate leaders or functional heads who need an independent senior people advisor sitting outside the central HR team. When you want an objective voice to pressure-test decisions that the in-house HRBP is too close to.',
      includes: [
        'Monthly strategic advisory session (60 min)',
        'Ad-hoc advice on people decisions and live situations',
        'Independent pressure-testing of HRBP or HRD recommendations',
        'Access to us via email between sessions',
        'Escalation to higher packages where a situation requires it',
      ],
    },
  },
  {
    name: 'Lead Optimiser',
    tag: 'Project · fix a specific problem',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      who: 'For businesses with a specific people challenge that needs fixing properly. A manager who is struggling. A performance process that is not working. A team structure that needs redesigning. A culture issue that has been ignored too long. Fixed scope, clear deliverable.',
      includes: [
        'Problem diagnosis and root cause analysis',
        'Manager coaching (up to 3 sessions)',
        'Process or framework design (one area)',
        'Written recommendations and implementation guide',
        'One follow-up review session',
      ],
    },
    corporate: {
      who: 'For leaders inheriting a BU, function, or region with a specific people challenge that internal HR has struggled to fix. Fixed scope, outside-in diagnosis, delivered to the business line rather than the central HR team.',
      includes: [
        'Problem diagnosis and root cause analysis scoped to the BU or region',
        'Leadership coaching (up to 3 sessions)',
        'Framework or redesign work (one focus area)',
        'Written recommendations and implementation guide',
        'One follow-up review session with the business lead',
      ],
    },
  },
  {
    name: 'Lead Partner',
    tag: 'Most popular · embedded fractional HR',
    highlight: true,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      who: 'For businesses that need a proper people function without the cost of a full-time CPO or HRD. We act as your fractional People lead: attending leadership team meetings, owning the people agenda, running manager capability work, and building the infrastructure your business needs to scale.',
      includes: [
        'Weekly leadership team attendance (where relevant)',
        'People strategy development and quarterly roadmap',
        'Manager enablement programme: structured, not one-off',
        'Performance framework design and implementation',
        'Engagement and retention planning',
        'Succession and talent planning (where relevant)',
        'Escalation point for all senior HR matters',
        'Direct line to us throughout',
      ],
    },
    corporate: {
      who: 'For divisions, regions, or portfolio companies that need senior people leadership on a dedicated basis without adding a permanent CPO-level headcount. We sit on the divisional leadership team, own the people agenda for that part of the business, and operate alongside group HR.',
      includes: [
        'Weekly divisional leadership team attendance',
        'Divisional people strategy and quarterly roadmap',
        'Senior-manager enablement programme',
        'Performance framework aligned to group standards',
        'Engagement and retention planning for the division',
        'Succession and talent planning at senior-manager level',
        'Escalation point for senior HR matters within the division',
        'Interface with group HR and the exec team',
      ],
    },
  },
  {
    name: 'Lead Build',
    tag: 'Scale · building your people function',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      who: 'For businesses scaling rapidly that need a people function built from scratch or completely rebuilt. We design the structure, hire into it, build the processes, and hand over a fully operational people function. This is not a retainer: it is a transformation engagement.',
      includes: [
        'Full people function design and build',
        'HRIS selection and implementation support',
        'HR hire scoping and interview support',
        'Manager capability programme (full cohort)',
        'Culture and values framework',
        'People strategy aligned to 12-24 month business plan',
        'Board-level people reporting framework',
        'Transition plan to in-house team',
      ],
    },
    corporate: {
      who: 'For corporate groups spinning up a new entity, integrating an acquisition, or rebuilding a failing people function in a specific region or BU. We design the structure, hire into it, build the processes, and transition to the permanent leadership.',
      includes: [
        'Target operating model design for the function',
        'HRIS selection or integration with group systems',
        'Senior HR hire scoping and interview support',
        'Manager capability programme (full cohort)',
        'Culture and values framework aligned to group',
        'People strategy aligned to a 12-24 month plan',
        'Board or ExCo-level people reporting framework',
        'Transition plan to permanent in-house leadership',
      ],
    },
  },
];

export default function LeadPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                LEAD: Services and Pricing
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
                <span className="text-gradient">on your people leadership.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                Most growing businesses reach a point where the founder is making too many people decisions, managers are not equipped to lead properly, and the business is scaling without the infrastructure to support it. That is where LEAD starts.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                From a reliable floor of strategic HR advice through to a full fractional CPO engagement: the right model depends on where the biggest gap is sitting. Not sure? A scoping call takes thirty minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">
                  Book a Call <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1560439514-4e9645039924?w=960&h=960&fit=crop&crop=faces" alt="Female leader speaking to a group of people in an office" fill className="object-cover" sizes="420px" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What LEAD covers */}
      <section style={{ padding: '2.5rem 1.5rem' }} className="lg:px-10">
        <div className="container-narrow">
          <div className="rounded-[18px] p-8" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}>
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600, fontSize: '1.4rem' }}>
              What LEAD covers
            </h2>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
              {[
                'Fractional People leadership (CPO / HRD level)',
                'People strategy and quarterly roadmap',
                'Manager enablement and coaching',
                'Performance and development frameworks',
                'Culture and engagement programmes',
                'Succession and talent planning',
                'HRIS selection and implementation',
                'Building and transitioning to an in-house team',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 py-1">
                  <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                  <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                </div>
              ))}
            </div>
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
              LEAD <span className="text-gradient">packages</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              From a reliable HR floor to a full people function build. Each engagement shapes differently depending on the size and shape of your organisation: choose the column that matches.
            </p>
          </div>

          {/* Column headers (desktop) */}
          <div className="hidden lg:grid grid-cols-2 gap-6 mb-4">
            <p className="eyebrow" style={{ color: 'var(--ink-faint)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              For growing businesses
            </p>
            <p className="eyebrow" style={{ color: 'var(--ink-faint)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              For corporate organisations
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {packages.map((pkg) => (
              <PackagePair key={pkg.name} pkg={pkg} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
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
                <span className="text-gradient">where the biggest gap is?</span>
              </h3>
              <p className="text-lg mb-8 max-w-xl" style={{ color: 'var(--ink-soft)' }}>
                Book thirty minutes with us. Bring your current people challenge and leave with a clear view of what needs fixing and which engagement makes sense.
              </p>
              <Link href="/book" className="btn-gradient">
                Book a Free Call <ArrowRight size={16} />
              </Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?w=960&h=960&fit=crop&crop=faces" alt="Business professionals discussing strategy" fill className="object-cover" sizes="420px" />
                <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: 'linear-gradient(to top, rgba(5,8,16,0.88) 0%, rgba(5,8,16,0.45) 60%, transparent 100%)' }}>
                  <p className="text-white text-sm leading-relaxed mb-2" style={{ fontStyle: 'italic', opacity: 0.95 }}>&ldquo;Not HR from a textbook. People results from operators who have done the real work.&rdquo;</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lucy &amp; Tom, The People System</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
        { q: 'What is fractional People leadership?', a: 'We act as your CPO or HRD on a part-time basis: typically one to three days per week depending on the package. You get senior-level people leadership without the cost of a full-time executive hire.' },
        { q: 'What is the difference between LEAD and PROTECT?', a: 'PROTECT builds the foundations: contracts, handbook, policies, compliance. LEAD is about leadership: strategy, culture, manager capability, people function design. Many clients need both. They can run in parallel or sequence depending on priority.' },
        { q: 'Do we need to have a people function already?', a: 'No. Lead Build is specifically designed for businesses building their people function from scratch. Lead Foundations and Lead Optimiser work well for businesses that have no formal HR function at all.' },
        { q: 'How involved are you on a day-to-day basis?', a: 'It depends on the package. Lead Foundations is one structured session per month plus ad-hoc access. Lead Partner typically involves weekly involvement including leadership team meetings. Lead Build is more intensive, particularly in the early months.' },
        { q: 'Can we combine LEAD with HIRE or PROTECT?', a: 'Yes, and many clients do. We work together on accounts that span multiple pillars. The People System is set up specifically for this: a joined-up people function across hiring, leadership, and compliance, run by people who actually talk to each other.' },
      ]} />

    </div>
  );
}

function PackagePair({ pkg }: { pkg: Package }) {
  return (
    <>
      <PackageCard pkg={pkg} variant="sme" audienceLabel="For growing businesses" />
      <PackageCard pkg={pkg} variant="corporate" audienceLabel="For corporate organisations" />
    </>
  );
}

function PackageCard({
  pkg,
  variant,
  audienceLabel,
}: {
  pkg: Package;
  variant: 'sme' | 'corporate';
  audienceLabel: string;
}) {
  const v = pkg[variant];
  const highlight = pkg.highlight;
  return (
    <div
      className="rounded-[22px] p-8 flex flex-col h-full"
      style={highlight
        ? { background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff', boxShadow: '0 8px 40px rgba(123,47,190,0.25)' }
        : { background: 'var(--surface)', border: '1px solid var(--brand-line)' }
      }
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-3 lg:hidden"
        style={{ color: highlight ? 'rgba(255,255,255,0.75)' : 'var(--ink-faint)', letterSpacing: '0.08em' }}
      >
        {audienceLabel}
      </p>
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
        {v.who}
      </p>
      <ul className="space-y-2 mb-8">
        {v.includes.map((item) => (
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
