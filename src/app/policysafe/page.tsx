import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, FileText, Shield, BookOpen, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PolicySafe™ | HR Compliance & Documents | Ravello HR',
  description: 'Get compliant, fast. PolicySafe™ by Ravello HR covers contracts, handbooks, policies and manager enablement for growing businesses.',
  alternates: { canonical: 'https://ravellohr.co.uk/policysafe' },
};

const risks = [
  { icon: AlertTriangle, title: 'No written contracts',      description: 'Employment without a written statement is a legal risk from day one. Tribunals are expensive. Prevention is not.' },
  { icon: FileText,      title: 'Outdated handbook',          description: 'A handbook written in 2019 doesn\'t cover remote work, AI use, mental health leave or the Carer\'s Leave Act. Gaps become grievances.' },
  { icon: Users,         title: 'Managers making it up',      description: 'Without clear policies, managers apply their own rules. Inconsistency breeds resentment — and discrimination claims.' },
  { icon: Shield,        title: 'No disciplinary framework',  description: 'One poorly handled disciplinary can cost £10k+ at tribunal. A clear, followed process is your only defence.' },
];

const packages = [
  {
    name: 'Starter',
    tag: 'For businesses under 10 people',
    price: 'From £495',
    highlight: false,
    items: ['Employment contract template', 'Offer letter template', 'Basic disciplinary & grievance procedure', 'Holiday & absence policy', '1-hour implementation call'],
    cta: { label: 'Get Started', href: '/book' },
  },
  {
    name: 'PolicySafe™ Core',
    tag: 'Most popular · 10–50 people',
    price: 'From £1,200',
    highlight: true,
    items: ['Full employment contract suite', 'Staff handbook (bespoke)', 'Core policy set (12 policies)', 'Manager guide & FAQ document', 'Gap analysis against current docs', '2 x review sessions'],
    cta: { label: 'Book a Scoping Call', href: '/book' },
  },
  {
    name: 'PolicySafe™ Gold',
    tag: 'Growing fast · 50+ people',
    price: 'Bespoke',
    highlight: false,
    items: ['Everything in Core', 'Full bespoke policy library', 'TUPE & restructure templates', 'Manager training session', 'Ongoing review & update retainer', 'Priority response SLA'],
    cta: { label: 'Talk to Lucinda', href: '/book' },
  },
];

const included = [
  'Written by an experienced HR professional — not an AI',
  'UK employment law compliant as of current legislation',
  'Plain English — your managers will actually read it',
  'Branded and formatted to your business',
  'Delivered with implementation guidance',
  'Not off-the-shelf — built around your specific risks',
];

export default function PolicySafePage() {
  return (
    <div className="pt-20">

      {/* Hero — light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-narrow">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-blue)', verticalAlign: 'middle' }} />
            PolicySafe™
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
            We need compliant HR.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Yesterday.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Growing businesses get caught out by the same thing: they move fast, hire people, and forget to build the paperwork foundation underneath.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            PolicySafe™ gives you the contracts, handbook and policies your business actually needs — written properly, not copy-pasted from a template site.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/tools/policy-healthcheck" className="btn-gradient">
              Run Your Free Policy Healthcheck <ArrowRight size={16} />
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
            <h2 className="section-title mb-4">What gaps look like in practice</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Most businesses only discover their policy gaps when something goes wrong. By then it&rsquo;s too late to fix cheaply.
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
              A lightweight staff handbook template covering the essentials. Download it, adapt it, use it. No strings — but if you want the full bespoke version, we&rsquo;re here.
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
            <h2 className="section-title mb-4">PolicySafe™ packages</h2>
            <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: 'var(--ink-soft)' }}>Fixed scope. Clear deliverables. Done properly.</p>
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
              <h2 className="section-title mb-6">What makes PolicySafe™ different</h2>
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
              <h3 style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: '1.6rem', marginBottom: '0.75rem' }}>Not sure where your gaps are?</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Run the free Policy &amp; Contract Healthcheck. Takes 3 minutes. Outputs a prioritised gap list you can take straight to your board.
              </p>
              <Link href="/tools/policy-healthcheck" className="btn-outline-white justify-center w-full">
                Start the Healthcheck <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
