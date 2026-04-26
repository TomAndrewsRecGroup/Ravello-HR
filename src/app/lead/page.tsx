import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'LEAD Services | L&D, Leadership and People Development | The People System',
  description: 'Three LEAD packages for growing businesses (Foundations, Partner, Build) with matching corporate tracks (Advisory, Programme, Transformation). Behavioural skills, leadership capability, manager training and L&D strategy: The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/lead' },
};

type Variant = {
  name: string;
  who: string;
  includes: string[];
};

type Package = {
  tag: string;
  highlight: boolean;
  cta: { label: string; href: string };
  sme: Variant;
  corporate: Variant;
};

const packages: Package[] = [
  {
    tag: 'Starting point · your L&D floor',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      name: 'LEAD Foundations',
      who: 'Every month we work with you on the stuff that actually builds a learning culture: structured check-ins that drive real decisions, hands-on support for managers dealing with live capability challenges, and a clear view of where your people development gaps are sitting before they start costing you.',
      includes: [
        'Monthly strategic L&D session with clear actions and follow through',
        'Behavioural coaching support for managers dealing with live people challenges',
        'Audit of your current approach to learning, feedback and development',
        'Practical guidance on career development and progression conversations',
        'Access to us between sessions when something needs addressing now',
        'Escalation to higher packages where the work requires it',
      ],
    },
    corporate: {
      name: 'LEAD Advisory',
      who: 'For corporate HR functions that want an external L&D partner on retainer: supporting managers with live capability challenges, pressure-testing internal L&D decisions, and surfacing development gaps across a specific business unit or region.',
      includes: [
        'Monthly strategic L&D session aligned to the BU or region',
        'Behavioural coaching support for managers dealing with live capability challenges',
        'Audit of the current L&D approach in the focus area against group standards',
        'Practical guidance on career development and progression conversations',
        'Access to us between sessions when something needs addressing now',
        'Escalation to higher packages where the work requires it',
      ],
    },
  },
  {
    tag: 'Most popular · embedded fractional L&D',
    highlight: true,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      name: 'LEAD Partner',
      who: 'For businesses that know their people need to develop but do not have the internal resource to make it happen properly. We act as your fractional L&D lead, owning the development agenda across your whole business, not just the senior team. This is not a course or a one-off workshop. It is a structured, ongoing programme that builds behavioural skills, leadership capability and a culture where people actually grow.',
      includes: [
        'People development strategy and quarterly roadmap with clear milestones',
        'Leadership and manager capability programme, structured and ongoing not ad hoc',
        'Behavioural skills development across all levels of the business',
        'Performance and feedback culture design and embedding',
        'Career development and progression frameworks bespoke to your business',
        'Team effectiveness and ways of working programmes',
        'Culture and values programmes',
        'Direct line to us throughout',
      ],
    },
    corporate: {
      name: 'LEAD Programme',
      who: 'For corporate groups, divisions or portfolio companies that need dedicated L&D leadership without adding a permanent headcount. We embed as your fractional L&D lead for the BU, region, or programme, own the development agenda, and work alongside group L&D.',
      includes: [
        'People development strategy for the BU or region with quarterly roadmap',
        'Leadership and manager capability programme, structured and ongoing',
        'Behavioural skills development across all levels of the division',
        'Performance and feedback culture design aligned to group frameworks',
        'Career development frameworks bespoke to the business unit',
        'Team effectiveness and ways of working programmes',
        'Culture and values programmes aligned to group',
        'Interface with group L&D and the divisional leadership team',
      ],
    },
  },
  {
    tag: 'Scale · building your L&D function',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    sme: {
      name: 'LEAD Build',
      who: 'You are scaling and your people function needs to keep up. LEAD Build is for businesses that need L&D designed, built and embedded properly, with the infrastructure, programmes and capability to run independently once we hand it over. We do not just design a strategy and leave. We build the whole thing, develop your people at every level and make sure whoever runs it after us has everything they need to keep it going.',
      includes: [
        'Full L&D function design, build and hire',
        'Leadership capability programme for your full management cohort',
        'Behavioural and skills development programmes across the business',
        'Culture, values and ways of working framework',
        'L&D strategy aligned to your 12 to 24 month business plan',
        'Career development and succession frameworks',
        'Board level people development reporting',
        'Transition plan and handover to your in-house team',
      ],
    },
    corporate: {
      name: 'LEAD Transformation',
      who: 'For corporate groups standing up a new entity, integrating an acquisition, or rebuilding a failing L&D function in a specific region or BU. We design the operating model, build the programmes and transition to the permanent in-house team.',
      includes: [
        'Target operating model design for the L&D function',
        'Leadership capability programme for your full management cohort',
        'Behavioural and skills development programmes across the business',
        'Culture, values and ways of working framework aligned to group',
        'L&D strategy aligned to the 12 to 24 month business plan',
        'Career development and succession frameworks',
        'Board or ExCo level people development reporting',
        'Transition plan and handover to permanent in-house leadership',
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
                LEAD: L&amp;D, Leadership and People Development
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
                Your people are your competitive advantage.<br />
                <span className="text-gradient">LEAD is how you develop them.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                From behavioural skills and leadership capability through to culture and strategy, LEAD is everything an effective L&amp;D function does, built around what your business actually needs right now.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                We work with everyone in your organisation, not just your managers. Because great businesses are built by people who keep getting better at what they do. One conversation is all it takes to figure out where to start.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
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
                'Leadership capability and behavioural skills development',
                'Manager training and equipping people to manage day to day effectively',
                'Culture building and engagement programmes',
                'L&D strategy aligned to business goals',
                'Learning programmes for all levels, including technical skills',
                'Performance management and feedback skills',
                'Team effectiveness and ways of working',
                'Career development and progression frameworks',
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
              <PackagePair key={pkg.sme.name} pkg={pkg} />
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
              <Link href="/book" className="btn-gradient">Book a Call</Link>
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
        { q: 'What is fractional L&D leadership?', a: 'We act as your L&D lead on a part-time basis, owning the development agenda across the business: leadership capability, behavioural skills, culture and career progression. You get senior-level L&D leadership without the cost of a full-time hire.' },
        { q: 'What is the difference between LEAD and PROTECT?', a: 'PROTECT covers HR generalist and compliance: contracts, handbooks, policies, ER, fractional CPO. LEAD is about learning and development: leadership capability, behavioural skills, culture and career progression. Many clients need both. They can run in parallel or sequence depending on priority.' },
        { q: 'Do we need to have an L&D function already?', a: 'No. LEAD Build is specifically designed for businesses setting up an L&D function from scratch. LEAD Foundations and LEAD Partner work well for businesses with no formal L&D function who want to start building the capability properly.' },
        { q: 'How involved are you on a day-to-day basis?', a: 'It depends on the package. LEAD Foundations is one structured session per month plus ad-hoc access. LEAD Partner typically involves weekly involvement including leadership team meetings. LEAD Build is more intensive, particularly in the early months.' },
        { q: 'Can we combine LEAD with HIRE or PROTECT?', a: 'Yes, and many clients do. We work together on accounts that span multiple pillars. The People System is set up specifically for this: a joined-up people function across hiring, leadership development, and HR foundations, run by people who actually talk to each other.' },
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
          {v.name}
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
