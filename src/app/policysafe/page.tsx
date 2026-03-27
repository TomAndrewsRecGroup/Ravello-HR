import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, FileText, Shield, BookOpen, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PROTECT | HR Foundations and Compliance | The People System',
  description: 'Get your HR foundations right before something goes wrong. Contracts, handbooks, compliance, Employment Rights Bill readiness: The People System.',
  alternates: { canonical: 'https://ravellohr.co.uk/policysafe' },
};

const risks = [
  { icon: AlertTriangle, title: 'No written contracts',           description: 'Employing someone without a written statement is a legal risk from day one. Tribunal claims are expensive to defend. Prevention costs a fraction of that.' },
  { icon: FileText,      title: 'Outdated or non-existent handbook', description: 'A handbook written in 2019 does not cover remote working, AI use, mental health leave or the Employment Rights Bill changes coming in 2025–26. Those gaps become grievances.' },
  { icon: Users,         title: 'Managers applying different rules', description: 'Without clear policies, managers invent their own version. Inconsistency creates resentment, discrimination risk, and the kind of tribunal claims that are hardest to defend.' },
  { icon: Shield,        title: 'No disciplinary framework',       description: 'One poorly handled disciplinary can cost over £10,000 at tribunal. A documented process, followed properly, is your most reliable protection. Most businesses do not have one.' },
];

const packages = [
  {
    name: 'Protect Essentials',
    tag: 'Starting point',
    price: 'From £495',
    highlight: false,
    items: ['Employment contract template', 'Offer letter template', 'Basic disciplinary & grievance procedure', 'Holiday & absence policy', '1-hour implementation call'],
    cta: { label: 'Get Started', href: '/book' },
  },
  {
    name: 'Protect Core',
    tag: 'Most popular · 10–50 people',
    price: 'From £1,200',
    highlight: true,
    items: ['Full employment contract suite', 'Staff handbook (bespoke)', 'Core policy set (12 policies)', 'Manager guide & FAQ document', 'Gap analysis against current docs', '2 x review sessions', 'Optional retainer: £500–£750/month'],
    cta: { label: 'Get a Free HR Audit', href: '/book' },
  },
  {
    name: 'Protect Partner',
    tag: 'Ongoing · 50+ people',
    price: '£1,500–£2,500/month',
    highlight: false,
    items: ['Everything in Core', 'Full bespoke policy library', 'Employment Rights Bill compliance review', 'Manager training session', 'Ongoing update retainer included', 'Priority response SLA'],
    cta: { label: 'Book a Call', href: '/book' },
  },
];

const included = [
  'Written by Lucy: 18+ years senior HR and People leadership, not a template service',
  'Fully compliant with current UK employment legislation, including Employment Rights Bill changes',
  'Written in plain English your managers will actually read and apply',
  'Branded and formatted to match your business',
  'Delivered with clear implementation guidance: not just a document dump',
  'Built around your specific risks and workforce, not copied from a generic library',
];

export default function PolicySafePage() {
  return (
    <div className="pt-28">

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-blue)', verticalAlign: 'middle' }} />
            PROTECT: The People System
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
            Get your HR foundations right.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Before something goes wrong.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Most HR compliance gaps are invisible until something breaks. Missing contracts. An outdated handbook. No disciplinary process. Managers applying different rules. The Employment Rights Bill is making this more urgent, not less.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Three outcomes: Documented. Protected. Ready to scale. Lucy builds the foundations your business genuinely needs: written properly, not copy-pasted from a template site.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Get a Free HR Audit <ArrowRight size={16} />
            </Link>
            <Link href="/book" className="btn-secondary">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      {/* Risk section */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">What happens when the foundations are missing</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Most businesses only find their compliance gaps when something breaks. By that point, the cost of fixing it is far higher than the cost of building it right the first time.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {risks.map((risk) => (
              <div key={risk.title} className="card flex gap-4">
                <risk.icon className="flex-shrink-0 mt-1" size={22} style={{ color: 'var(--brand-purple)' }} />
                <div>
                  <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{risk.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{risk.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link href="/tools/policy-healthcheck" className="btn-secondary">
              Check Your Policy Gaps Free <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Free handbook download */}
      <section className="section-sm" style={{ background: 'var(--bg)' }}>
        <div className="container-narrow">
          <div className="rounded-[18px] p-8 lg:p-12 text-white text-center" style={{ background: 'var(--brand-navy)' }}>
            <BookOpen className="mx-auto mb-4" size={36} style={{ color: '#9B6FD8' }} />
            <h2 style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: '1.75rem', marginBottom: '0.75rem' }}>
              Free Starter Handbook Template
            </h2>
            <p className="text-sm leading-relaxed mb-6 max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
              A lightweight staff handbook template that covers the essentials. Use it, adapt it, build on it. Completely free. When you are ready for the full bespoke version written by Lucy, we are here.
            </p>
            <a href="https://tally.so/r/ravello-handbook" target="_blank" rel="noopener noreferrer" className="btn-gradient">
              Download Free Template <ArrowRight size={16} />
            </a>
            <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>We&rsquo;ll email it to you. No spam, unsubscribe any time.</p>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="section-title mb-4">PROTECT packages</h2>
            <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>Fixed scope. Clear deliverables. Done properly by Lucy.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`rounded-[18px] p-7 flex flex-col transition-all duration-300 ${pkg.highlight ? 'scale-[1.02]' : ''}`}
                style={{
                  background: '#fff',
                  border: pkg.highlight ? `2px solid var(--brand-purple)` : '1px solid var(--brand-line)',
                  boxShadow: pkg.highlight ? '0 8px 40px rgba(123,47,190,0.15)' : '0 2px 8px rgba(13,21,53,0.05)',
                }}
              >
                <div className="mb-5">
                  <span className="pill pill-purple mb-3 inline-block">{pkg.tag}</span>
                  <h3 className="font-bold text-xl mb-1" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600 }}>{pkg.name}</h3>
                  <p className="font-semibold text-lg" style={{ color: 'var(--brand-purple)' }}>{pkg.price}</p>
                </div>
                <ul className="space-y-2 flex-1 mb-6">
                  {pkg.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                      <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={pkg.cta.href} className={pkg.highlight ? 'btn-gradient justify-center' : 'btn-secondary justify-center'}>
                  {pkg.cta.label} <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's different */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title mb-6">What makes PROTECT different</h2>
              <ul className="space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="flex-shrink-0 mt-0.5" size={18} style={{ color: 'var(--brand-purple)' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[18px] p-8" style={{ background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: '#fff' }}>
              <h3 style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: '1.6rem', marginBottom: '0.75rem' }}>Not sure what your compliance exposure looks like?</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Book a free HR audit with Lucy. Thirty minutes. You will leave with a clear, prioritised picture of what is missing and what to fix first.
              </p>
              <Link href="/book" className="btn-outline-white justify-center w-full">
                Get a Free HR Audit <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
          { q: 'What is PROTECT?', a: 'The foundations pillar of The People System. Lucy builds the contracts, handbook, and policies your business genuinely needs: compliant, practical, and written in plain English your managers will actually follow.' },
          { q: 'What packages are available?', a: 'Protect Essentials (from £495 one-off), Protect Core (from £1,200 one-off, optional retainer £500–£750/month), Protect Partner (£1,500–£2,500/month), Protect Enterprise (bespoke, £3,000–£5,000+/month), and Protect Transaction (from £3,500, for M&A and TUPE work).' },
          { q: 'What about the Employment Rights Bill?', a: 'The Employment Rights Bill introduces significant changes for UK employers: particularly around zero-hours contracts, day-one rights, and dismissal processes. Lucy reviews every engagement against current and upcoming legislation so your documentation is ready, not reactive.' },
          { q: 'Who is PROTECT for?', a: 'Any business that has been moving fast without building proper HR foundations. This is especially common in founder-led SMEs, VC-backed businesses post-raise, and businesses that have not reviewed their HR documentation in more than two years.' },
          { q: 'How long does it take?', a: 'Most PROTECT engagements complete within two to four weeks depending on the package and the state of your existing documentation.' },
        ]} />

    
    </div>
  );
}
