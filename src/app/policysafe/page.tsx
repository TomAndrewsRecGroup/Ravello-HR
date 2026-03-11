import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, FileText, Shield, BookOpen, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PolicySafe™ | HR Compliance & Documents | Ravello HR',
  description:
    'Get compliant, fast. PolicySafe™ by Ravello HR covers contracts, handbooks, policies and manager enablement for growing businesses.',
  alternates: { canonical: 'https://ravellohr.co.uk/policysafe' },
};

const risks = [
  {
    icon: AlertTriangle,
    title: 'No written contracts',
    description: 'Employment without a written statement is a legal risk from day one. Tribunals are expensive. Prevention is not.',
  },
  {
    icon: FileText,
    title: 'Outdated handbook',
    description: 'A handbook written in 2019 doesn’t cover remote work, AI use, mental health leave or the Carer’s Leave Act. Gaps become grievances.',
  },
  {
    icon: Users,
    title: 'Managers making it up',
    description: 'Without clear policies, managers apply their own rules. Inconsistency breeds resentment — and discrimination claims.',
  },
  {
    icon: Shield,
    title: 'No disciplinary framework',
    description: 'One poorly handled disciplinary can cost £10k+ at tribunal. A clear, followed process is your only defence.',
  },
];

const packages = [
  {
    name: 'Starter',
    tag: 'For businesses under 10 people',
    price: 'From £495',
    color: 'border-gray-200',
    tagColor: 'bg-brand-light text-brand-slate',
    items: [
      'Employment contract template',
      'Offer letter template',
      'Basic disciplinary & grievance procedure',
      'Holiday & absence policy',
      '1-hour implementation call',
    ],
    cta: { label: 'Get Started', href: '/book' },
    highlight: false,
  },
  {
    name: 'PolicySafe™ Core',
    tag: 'Most popular · 10–50 people',
    price: 'From £1,200',
    color: 'border-brand-teal',
    tagColor: 'bg-brand-teal text-white',
    items: [
      'Full employment contract suite',
      'Staff handbook (bespoke)',
      'Core policy set (12 policies)',
      'Manager guide & FAQ document',
      'Gap analysis against current docs',
      '2 x review sessions',
    ],
    cta: { label: 'Book a Scoping Call', href: '/book' },
    highlight: true,
  },
  {
    name: 'PolicySafe™ Gold',
    tag: 'Growing fast · 50+ people',
    price: 'Bespoke',
    color: 'border-brand-gold',
    tagColor: 'bg-brand-gold text-white',
    items: [
      'Everything in Core',
      'Full bespoke policy library',
      'TUPE & restructure templates',
      'Manager training session',
      'Ongoing review & update retainer',
      'Priority response SLA',
    ],
    cta: { label: 'Talk to Lucinda', href: '/book' },
    highlight: false,
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

      {/* Hero */}
      <section className="gradient-hero text-white py-20 lg:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <span className="funnel-tag bg-brand-gold text-white mb-6 inline-block">PolicySafe™</span>
          <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            We need compliant HR.<br />
            <span className="text-gradient">Yesterday.</span>
          </h1>
          <p className="text-white/80 text-xl mb-4 max-w-2xl">
            Growing businesses get caught out by the same thing: they move fast, hire people, and forget to build the paperwork foundation underneath.
          </p>
          <p className="text-white/70 text-lg mb-10 max-w-2xl">
            PolicySafe™ gives you the contracts, handbook and policies your business actually needs — written properly, not copy-pasted from a template site.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/tools/policy-healthcheck" className="btn-gold text-base">
              Run Your Free Policy Healthcheck <ArrowRight size={18} />
            </Link>
            <Link href="/book" className="btn-outline text-base border-white text-white hover:bg-white hover:text-brand-navy">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      {/* Risk section */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              What gaps look like in practice
            </h2>
            <p className="text-brand-slate text-lg max-w-2xl mx-auto">
              Most businesses only discover their policy gaps when something goes wrong. By then it’s too late to fix cheaply.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {risks.map((risk) => (
              <div key={risk.title} className="card flex gap-4">
                <risk.icon className="text-brand-gold flex-shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-display font-bold text-lg text-brand-navy mb-1">{risk.title}</h3>
                  <p className="text-brand-slate text-sm leading-relaxed">{risk.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/tools/policy-healthcheck" className="btn-outline">
              Check Your Policy Gaps Free <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Free handbook capture */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow">
          <div className="bg-brand-navy rounded-2xl p-8 lg:p-12 text-white text-center">
            <BookOpen className="mx-auto mb-4 text-brand-gold" size={40} />
            <h2 className="font-display text-2xl lg:text-3xl font-bold mb-3">
              Free Starter Handbook Template
            </h2>
            <p className="text-white/70 mb-6 max-w-lg mx-auto">
              A lightweight staff handbook template covering the essentials. Download it, adapt it, use it. No strings — but if you want the full bespoke version, we’re here.
            </p>
            <a
              href="https://tally.so/r/ravello-handbook"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold"
            >
              Download Free Template <ArrowRight size={18} />
            </a>
            <p className="text-white/40 text-xs mt-3">We’ll email it to you. No spam, unsubscribe any time.</p>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              PolicySafe™ packages
            </h2>
            <p className="text-brand-slate text-lg max-w-xl mx-auto">
              Fixed scope. Clear deliverables. Done properly.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`rounded-2xl border-2 ${pkg.color} p-6 flex flex-col ${
                  pkg.highlight ? 'shadow-xl scale-[1.02]' : 'shadow-sm'
                }`}
              >
                <div className="mb-4">
                  <span className={`funnel-tag text-xs ${pkg.tagColor} mb-2 inline-block`}>{pkg.tag}</span>
                  <h3 className="font-display font-bold text-xl text-brand-navy">{pkg.name}</h3>
                  <p className="text-brand-teal font-semibold text-lg mt-1">{pkg.price}</p>
                </div>
                <ul className="space-y-2 flex-1 mb-6">
                  {pkg.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-brand-slate">
                      <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={pkg.cta.href}
                  className={pkg.highlight ? 'btn-primary justify-center' : 'btn-outline justify-center'}
                >
                  {pkg.cta.label} <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What’s included */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-3xl font-bold text-brand-navy mb-6">
                What makes PolicySafe™ different
              </h2>
              <ul className="space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={20} />
                    <span className="text-brand-slate">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card bg-brand-teal border-brand-teal text-white">
              <h3 className="font-display text-2xl font-bold mb-3">Not sure where your gaps are?</h3>
              <p className="text-white/80 mb-6">
                Run the free Policy & Contract Healthcheck. Takes 3 minutes. Outputs a prioritised gap list you can take straight to your board.
              </p>
              <Link href="/tools/policy-healthcheck" className="btn-secondary justify-center w-full">
                Start the Healthcheck <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
