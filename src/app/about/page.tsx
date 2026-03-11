import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Award, Building2, TrendingUp } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Ravello HR | Lucinda Reader | Strategic HR Consultancy',
  description:
    'Lucinda Reader is a senior HR professional with experience across major UK and global brands. Ravello HR delivers strategic HR — not generic consultancy.',
  alternates: { canonical: 'https://ravellohr.co.uk/about' },
};

const credentials = [
  'Senior HR leadership across FTSE-listed and high-growth businesses',
  'Managed people programmes through acquisitions, restructures and rapid scale',
  'Built hiring systems that reduced agency spend by 40–60% in 12 months',
  'Designed HR frameworks adopted across multi-site, multi-country operations',
  'Advised leadership teams on change management affecting 100s of employees',
  'Delivered TUPE and redundancy processes with zero tribunal outcomes',
];

const brands = [
  { label: 'Retail & Consumer', desc: 'Multi-site HR transformation, manager capability programme' },
  { label: 'Professional Services', desc: 'Hiring system redesign, reduced time-to-hire by 8 weeks' },
  { label: 'Private Equity-backed SME', desc: 'Pre-acquisition people DD, post-deal integration' },
  { label: 'Technology Scale-up', desc: 'Full HR infrastructure build from 12 to 80 people' },
  { label: 'Manufacturing & Industrial', desc: 'Restructure and redundancy programme, TUPE transfer' },
  { label: 'Healthcare & Services', desc: 'Compliance overhaul, policy library and manager training' },
];

const values = [
  {
    icon: Award,
    title: 'Named systems, not vague advice',
    description: 'Every engagement produces something tangible — a scorecard, a process, a framework. Not a slide deck that gathers dust.',
  },
  {
    icon: TrendingUp,
    title: 'Commercial first',
    description: 'Good HR reduces cost, improves performance and protects the business. That’s how Lucinda frames every piece of work.',
  },
  {
    icon: Building2,
    title: 'Built for how businesses actually work',
    description: 'No off-the-shelf solutions. No generic templates. Everything is shaped around your size, sector and specific risk.',
  },
];

export default function AboutPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="gradient-hero text-white py-20 lg:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <span className="funnel-tag bg-white/20 border border-white/30 text-white mb-6 inline-block">About Ravello HR</span>
          <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            Senior HR expertise.<br />
            <span className="text-gradient">Without the corporate overhead.</span>
          </h1>
          <p className="text-white/80 text-xl max-w-2xl">
            Ravello HR is Lucinda Reader — a senior HR professional who has led people programmes inside major brands and now brings that capability directly to ambitious businesses that need it most.
          </p>
        </div>
      </section>

      {/* Founder section */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-brand-teal font-semibold text-sm uppercase tracking-widest mb-3">The Founder</p>
              <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-6">
                Lucinda Reader
              </h2>
              <div className="space-y-4 text-brand-slate leading-relaxed">
                <p>
                  Lucinda spent over a decade inside large, complex organisations — leading HR through acquisitions, rapid growth, restructures and the kind of people challenges that textbooks don’t cover.
                </p>
                <p>
                  She built Ravello HR because she kept seeing the same thing: brilliant businesses held back by hiring that didn’t work, compliance that was one tribunal away from disaster, and people decisions made on instinct rather than process.
                </p>
                <p>
                  The result is three named systems — Smart Hiring System™, PolicySafe™ and DealReady People™ — each built from real-world experience, not theory.
                </p>
              </div>
              <div className="mt-8">
                <Link href="/book" className="btn-primary">
                  Work with Lucinda <ArrowRight size={18} />
                </Link>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-brand-offwhite rounded-2xl p-6 border border-gray-100">
                <p className="text-brand-gold font-semibold text-sm uppercase tracking-widest mb-3">Credentials</p>
                <ul className="space-y-2">
                  {credentials.map((c) => (
                    <li key={c} className="flex items-start gap-3">
                      <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={16} />
                      <span className="text-brand-slate text-sm">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Proof / brand work */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="text-center mb-12">
            <p className="text-brand-teal font-semibold text-sm uppercase tracking-widest mb-3">Proof of Work</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              Work led across sectors
            </h2>
            <p className="text-brand-slate text-lg max-w-2xl mx-auto">
              Lucinda has worked inside and alongside businesses across retail, professional services, technology, manufacturing and healthcare. The names stay confidential. The results don’t.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {brands.map((b) => (
              <div key={b.label} className="card">
                <Building2 className="text-brand-teal mb-3" size={24} />
                <h3 className="font-display font-bold text-brand-navy mb-1">{b.label}</h3>
                <p className="text-brand-slate text-sm">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-brand-navy mb-4">
              How Ravello HR works
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((v) => (
              <div key={v.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand-offwhite flex items-center justify-center mx-auto mb-4">
                  <v.icon className="text-brand-teal" size={28} />
                </div>
                <h3 className="font-display font-bold text-lg text-brand-navy mb-2">{v.title}</h3>
                <p className="text-brand-slate text-sm leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-brand-navy text-white">
        <div className="container-narrow text-center">
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">
            Ready to work together?
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            Book a free 15-minute call. Bring your current HR challenge and leave with a clear next step.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-primary">
              Book a Free Call <ArrowRight size={18} />
            </Link>
            <Link href="/tools/hr-risk-score" className="btn-outline border-white text-white hover:bg-white hover:text-brand-navy">
              Check Your HR Risk Score
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
