import { Metadata } from 'next';
import Image from 'next/image';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PROTECT Services | HR Foundations, Compliance and Fractional CPO | The People System',
  description: 'Three PROTECT packages: PROTECT Foundations, PROTECT Partner, PROTECT CPO. Contracts, handbooks, compliance, ER case management and fractional CPO leadership: The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/protect' },
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
    tag: 'Starting point · documentation and ongoing check-in',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'PROTECT Foundations',
    who: 'Your contracts are probably out of date. Your policies may not reflect current employment law. When something goes wrong with an employee, you are figuring it out as you go. PROTECT Foundations fixes that. We build the documentation and compliance your business needs and stay on hand when people issues come up, so you are never making it up under pressure.',
    includes: [
      'Full audit of existing contracts, policies, and HR documentation',
      'Employment contracts drafted or updated to current legal standards',
      'Handbook covering disciplinaries, grievances, absence, performance, and conduct',
      'Statutory policies aligned to UK employment law including the Employment Rights Act',
      'Monthly HR check-in: live ER issues, compliance updates, people questions',
      'Up to 2 escalation calls per month for urgent or time-sensitive situations',
    ],
  },
  {
    tag: 'Most popular · ongoing HR generalist support',
    highlight: true,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'PROTECT Partner',
    who: 'For teams that need a proper HR function on an ongoing basis. Not just documents and compliance but hands-on support across everything people-related: ER cases, org design, skills mapping, restructures, and the strategic infrastructure to support a business that is growing or changing shape.',
    includes: [
      'Everything in PROTECT Foundations',
      'Fortnightly HR session: ER cases, people decisions, priorities and planning',
      'Up to 4 escalation calls per month for complex or urgent situations',
      'End-to-end ER case management: disciplinaries, grievances, performance, redundancy, and TUPE',
      'Organisational design, workforce planning, and restructuring support',
      'Skills mapping and capability gap analysis across the workforce',
      'HRIS selection and implementation guidance',
      'Onboarding and offboarding processes designed and embedded',
      'People data and monthly HR reporting',
    ],
  },
  {
    tag: 'Executive · fractional CPO',
    highlight: false,
    cta: { label: 'Book a Call', href: '/book' },
    name: 'PROTECT CPO',
    who: 'For teams that need someone operating at CPO or HRD level without the full-time cost. We sit at your leadership table, own the people agenda, hold the compliance and ER risk, and build the people strategy your business needs to scale. This is not a support service. It is executive-level people leadership.',
    includes: [
      'Everything in PROTECT Partner',
      'Weekly fractional CPO session plus leadership team and board attendance',
      'People strategy aligned to your 12 to 36 month business plan',
      'Skills mapping, succession planning, and talent pipeline development',
      'Reward and compensation strategy including grading and pay structures',
      'DEI strategy and implementation',
      'Culture and values design and embedding',
      'Employment tribunal risk management and legal liaison',
      'Investor and board-level people reporting',
      'Change management and transformation programmes',
      'Transition planning when you are ready to hire in-house',
    ],
  },
];

export default function ProtectPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2.5rem' }} className="lg:px-10">
        <div className="container-wide">
          <div className="grid lg:grid-cols-[1fr_420px] gap-14 items-center">
            <div>
              <p className="eyebrow mb-5">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-blue)', verticalAlign: 'middle' }} />
                PROTECT: HR Foundations, Compliance and Fractional CPO
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
                Keeping your business compliant, your people protected, and your{' '}
                <span className="text-gradient">HR Infrastructure built for your own journey.</span>
              </h1>
              <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
                Documented. Protected. Ready to scale. Every PROTECT engagement is built around what your business genuinely needs: not a copy-paste from a template library. Written by us. Compliant with current UK law, including Employment Rights Bill changes.
              </p>
              <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
                Not sure where to start? A free HR audit gives you a clear, prioritised picture of your compliance exposure and what to fix first.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/book" className="btn-gradient">Book a Call</Link>
                <Link href="/policysafe" className="btn-secondary">
                  How PROTECT works
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1556761175-b413da4baf72?w=960&h=960&fit=crop&crop=faces" alt="Team reviewing compliance documents" fill className="object-cover" sizes="420px" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Employment Rights Bill callout */}
      <section style={{ padding: '2.5rem 1.5rem' }} className="lg:px-10">
        <div className="container-narrow">
          <div className="rounded-[18px] p-8 flex flex-col sm:flex-row gap-5 items-start" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.18)' }}>
            <AlertTriangle size={26} className="flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
            <div>
              <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--ink)' }}>Employment Rights Bill: compliance pressure is building now</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                The Employment Rights Bill introduces significant changes for UK employers: expanded day-one rights, reformed zero-hours protections, and tighter dismissal requirements. Many SMEs are not ready. Every PROTECT Foundations engagement and above includes an Employment Rights Bill compliance check as standard.
              </p>
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
              PROTECT <span className="text-gradient">packages</span>
            </h3>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              From a fast one-off essentials fix to fully managed ongoing compliance. Each engagement is scoped to the size and shape of your organisation. Talk to us about which one fits and we will shape the detail.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <PackageCard key={pkg.name} pkg={pkg} />
            ))}
          </div>
        </div>
      </section>

      {/* Audit CTA */}
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
                Start with<br />
                <span className="text-gradient">a free HR audit</span>
              </h3>
              <p className="text-lg mb-8 max-w-xl" style={{ color: 'var(--ink-soft)' }}>
                One conversation with us. You will leave with a clear, prioritised view of your compliance exposure, what is missing, and which PROTECT package is the right starting point.
              </p>
              <Link href="/book" className="btn-gradient">Book a Call</Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-[24px] overflow-hidden" style={{ height: 480 }}>
                <Image src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=960&h=960&fit=crop&crop=faces" alt="Business professionals discussing strategy" fill className="object-cover" sizes="420px" />
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
        { q: 'How are PROTECT packages scoped?', a: 'PROTECT Foundations, PROTECT Partner and PROTECT CPO are all ongoing engagements: Foundations runs on a monthly rhythm, Partner on a fortnightly rhythm, and CPO weekly plus leadership team and board attendance. Pricing is shaped to scope and organisation size: book a call and we will put it in writing.' },
        { q: 'Does the Employment Rights Bill affect us?', a: 'Almost certainly yes, if you employ people in the UK. The Bill extends day-one rights, reforms zero-hours protections, and tightens the rules around dismissal and redundancy. The changes are staggered through 2025 and 2026. We review every PROTECT Foundations engagement and above against current and upcoming legislation.' },
        { q: 'How long does the initial setup take?', a: 'Once you start on PROTECT Foundations, the audit, contract and handbook rebuild typically completes within two to four weeks depending on the state of your existing documentation. Ongoing check-ins begin from month one.' },
        { q: 'We already have a basic handbook. Do we need this?', a: 'If it was written more than two years ago, probably yes. Employment law changes, working practices change, and gaps that seemed minor become claims. We will do a gap analysis as part of PROTECT Foundations before any rewriting begins.' },
        { q: 'Is this legal advice?', a: 'PROTECT covers HR documentation and employment compliance: contracts, handbooks, policies, and procedures. For active litigation or complex legal disputes, we work alongside your employment solicitor rather than replacing them.' },
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
