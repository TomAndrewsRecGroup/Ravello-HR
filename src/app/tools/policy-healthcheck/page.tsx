import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PolicyHealthcheckTool from '@/components/tools/PolicyHealthcheckTool';

export const metadata: Metadata = {
  title: 'Policy and Contract Healthcheck | The People System',
  description:
    'Free Policy and Contract Healthcheck. Find your HR documentation gaps and get a prioritised fix list: before something goes wrong. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/policy-healthcheck' },
};

export default function PolicyHealthcheckPage() {
  return (
    <div className="pt-28">

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: PolicySafe™
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
            Your policies have gaps.<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Find them before something goes wrong.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            A quick scan of your HR documents. Most businesses are missing at least three critical policies and do not know it until a tribunal or audit forces the issue. Walk away with a clear gap list and the language to brief your board.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Check off what you have, flag what is missing, and get a prioritised fix list you can act on immediately.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Book a Free Policy Review <ArrowRight size={16} />
            </Link>
            <Link href="/book" className="btn-secondary">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="max-w-[1200px] mx-auto">
          <PolicyHealthcheckTool />
        </div>
      </section>
    </div>
  );
}
