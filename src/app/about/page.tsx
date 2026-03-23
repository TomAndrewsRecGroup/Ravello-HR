import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Award, Building2, TrendingUp } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Ravello HR | Lucinda Reader | Strategic HR Consultancy',
  description: 'Lucinda Reader is a senior HR professional with experience across major UK and global brands. Ravello HR delivers strategic HR built around your business, not generic consultancy.',
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
  { label: 'Retail & Consumer',          desc: 'Multi-site HR transformation, manager capability programme' },
  { label: 'Professional Services',       desc: 'Hiring system redesign, reduced time-to-hire by 8 weeks' },
  { label: 'Private Equity-backed SME',   desc: 'Pre-acquisition people DD, post-deal integration' },
  { label: 'Technology Scale-up',         desc: 'Full HR infrastructure build from 12 to 80 people' },
  { label: 'Manufacturing & Industrial',  desc: 'Restructure and redundancy programme, TUPE transfer' },
  { label: 'Healthcare & Services',       desc: 'Compliance overhaul, policy library and manager training' },
];

const values = [
  { icon: Award,     title: 'Named systems, not vague advice',              description: 'Every engagement produces something tangible: a scorecard, a process, a framework. Not a slide deck that collects dust.' },
  { icon: TrendingUp, title: 'Commercial first, always',                    description: 'Good HR reduces cost, improves performance and protects the business. That is how Lucinda frames every single piece of work.' },
  { icon: Building2, title: 'Built for how businesses actually work',        description: 'No off-the-shelf solutions. No generic templates. Everything is shaped around your size, sector and the specific risks you face.' },
];

export default function AboutPage() {
  return (
    <div className="pt-20">

      {/* Hero — light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-narrow">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            About Ravello HR
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
            Senior HR expertise.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Delivered without the corporate overhead.
            </span>
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Ravello HR is Lucinda Reader. A senior HR professional who built her career inside some of the UK&rsquo;s most demanding organisations and now brings that same capability directly to the ambitious businesses that need it most.
          </p>
        </div>
      </section>

      {/* Founder section */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="eyebrow mb-3">The Founder</p>
              <h2 className="section-title mb-6">Lucinda Reader</h2>
              <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                <p>
                  Lucinda spent over a decade inside large, complex organisations, leading HR through acquisitions, rapid growth, restructures and the kind of people challenges that no textbook ever quite covers.
                </p>
                <p>
                  She built Ravello HR because she kept seeing the same pattern: brilliant businesses held back by hiring that kept breaking, compliance that was one tribunal away from disaster, and people decisions made on gut feel rather than solid process.
                </p>
                <p>
                  The result is three named systems, Smart Hiring System™, PolicySafe™ and DealReady People™, each built from real-world experience and designed to produce outcomes you can actually measure.
                </p>
              </div>
              <div className="mt-8">
                <Link href="/book" className="btn-gradient">
                  Work with Lucinda <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div>
              <div className="rounded-[18px] p-6" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}>
                <p className="eyebrow mb-4">Credentials</p>
                <ul className="space-y-2">
                  {credentials.map((c) => (
                    <li key={c} className="flex items-start gap-3">
                      <CheckCircle className="flex-shrink-0 mt-0.5" size={14} style={{ color: 'var(--brand-purple)' }} />
                      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Proof of work */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <p className="eyebrow justify-center mb-3">Proof of Work</p>
            <h2 className="section-title mb-4">Experience across every sector</h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--ink-soft)' }}>
              Lucinda has worked inside and alongside businesses across retail, professional services, technology, manufacturing and healthcare. Client names stay confidential. The outcomes do not.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {brands.map((b) => (
              <div key={b.label} className="card">
                <Building2 className="mb-3" size={22} style={{ color: 'var(--brand-purple)' }} />
                <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{b.label}</h3>
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="section-title mb-4">How Ravello HR works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((v) => (
              <div key={v.title} className="text-center">
                <div className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg)' }}>
                  <v.icon size={26} style={{ color: 'var(--brand-purple)' }} />
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{v.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — dark */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title-light mb-4">Ready to work together?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Book a free 15-minute call. Bring your current HR challenge and leave with a clear, actionable next step.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-gradient">
              Book a Free Call <ArrowRight size={16} />
            </Link>
            <Link href="/tools/hr-risk-score" className="btn-outline-white">
              Check Your HR Risk Score
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
