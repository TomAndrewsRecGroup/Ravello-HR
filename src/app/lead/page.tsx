import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import PageSchema from '@/components/PageSchema';
import AioSummary from '@/components/AioSummary';
import Link from 'next/link';
import { ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'LEAD Services | L&D, Leadership and People Development | The People System',
  description: 'Three LEAD packages: Foundations, Partner, Build. Behavioural skills, leadership capability, manager training, and L&D strategy. The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/lead' },
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
    tag: 'Starting point · your L&D floor',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'LEAD Foundations',
    who: 'A monthly partnership built around the work that actually shifts a learning culture. Structured sessions that drive real decisions, hands-on support for managers dealing with live capability challenges, and a clear view of where the development gaps are sitting before they start costing you. Right for businesses without a formal L&D function and for divisions that want an external partner on retainer.',
    includes: [
      'Monthly strategic L&D session with clear actions and follow through',
      'Behavioural coaching support for managers dealing with live people challenges',
      'Audit of the current approach to learning, feedback, and development',
      'Practical guidance on career development and progression conversations',
      'Access to us between sessions when something needs addressing now',
      'Escalation to higher packages where the work requires it',
    ],
  },
  {
    tag: 'Most popular · embedded fractional L&D',
    highlight: true,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'LEAD Partner',
    who: 'For teams that know their people need to develop but do not have the internal resource to make it happen properly. We act as your fractional L&D lead, owning the development agenda across the business or business unit. This is not a course or a one-off workshop. It is a structured, ongoing programme that builds behavioural skills, leadership capability, and a culture where people actually grow.',
    includes: [
      'People development strategy and quarterly roadmap with clear milestones',
      'Leadership and manager capability programme, structured and ongoing',
      'Behavioural skills development across all levels of the business',
      'Performance and feedback culture design and embedding',
      'Career development and progression frameworks bespoke to your business',
      'Team effectiveness and ways of working programmes',
      'Culture and values programmes',
      'Direct line to us throughout',
    ],
  },
  {
    tag: 'Scale · building your L&D function',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'LEAD Build',
    who: 'For businesses that need L&D designed, built, and embedded properly, with the infrastructure, programmes, and capability to run independently once we step back. Right for first-time L&D builds, integrations after acquisition, and rebuilds of underperforming functions. We do the whole thing and hand it over running.',
    includes: [
      'Target operating model and full L&D function design',
      'Leadership capability programme for your full management cohort',
      'Behavioural and skills development programmes across the business',
      'Culture, values, and ways of working framework',
      'L&D strategy aligned to your 12 to 24 month business plan',
      'Career development and succession frameworks',
      'Board or leadership-level people development reporting',
      'Transition plan and handover to your in-house team',
    ],
  },
];

const FAQ = [
  { q: 'Who is LEAD for?', a: 'UK SMEs that know their managers and people need to develop, but do not have the internal L&D resource to make it happen at the depth required. Right for first-time L&D builds, businesses without a formal learning culture, and post-acquisition integrations.' },
  { q: 'How is LEAD different from a training provider?', a: 'A training provider sells courses. LEAD is a fractional L&D function: strategy, programme design, manager capability, performance frameworks and culture work, owned end to end by a senior lead. The output is a system, not a course catalogue.' },
  { q: 'What is the minimum commitment?', a: 'LEAD Foundations and LEAD Partner have a 3-month minimum. LEAD Build is scoped as a defined-outcome project, typically 6 to 9 months.' },
  { q: 'Can LEAD work alongside our existing HR or HRBP?', a: 'Yes, that is the typical setup. We sit underneath your in-house HR on the specialist development work while they stay close to the day-to-day team.' },
];

export default function LeadPage() {
  return (
    <div className="pt-28">
      <PageSchema
        breadcrumbs={[{ name: 'Home', url: '/' }, { name: 'LEAD', url: '/lead' }]}
        faqs={FAQ}
        service={{
          name: 'LEAD: leadership development and L&D strategy',
          description: 'Fractional L&D and leadership development for UK SMEs. Three packages (Foundations, Partner, Build) covering manager training, performance frameworks, behavioural skills and L&D operating model.',
          url: 'https://thepeoplesystem.co.uk/lead',
          serviceType: 'Learning and development consultancy',
          offers: packages.map((p) => ({ name: p.name, description: p.who })),
        }}
      />

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
              From a reliable L&amp;D floor to a full function build. Each engagement is scoped to the size and shape of your organisation. Talk to us about which one fits and we will shape the detail.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <PackageCard key={pkg.name} pkg={pkg} />
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
                Book a call with us. Bring your current people challenge and leave with a clear view of what needs fixing and which engagement makes sense.
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

      {/* AIO summary */}
      <section style={{ background: 'var(--bg)', padding: '1rem 1.5rem 3rem' }} className="lg:px-10">
        <div className="container-wide max-w-[900px]">
          <AioSummary
            what="LEAD is The People System's L&D and leadership development pillar. Three packages (Foundations, Partner, Build) covering manager capability, performance frameworks, behavioural skills and L&D operating model."
            who="UK SMEs without a formal L&D function, scaling teams whose managers need real capability development, and post-acquisition integrations rebuilding the people development model."
            problem="Managers promoted into leadership without training, no performance or feedback culture, course-buying instead of capability building, and culture work that never lands."
            next="Book a call. We bring you a clear view of where the biggest capability gap sits and which LEAD package fits."
          />
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
