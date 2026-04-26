import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import HRRiskScoreTool from '@/components/tools/HRRiskScoreTool';

export const metadata: Metadata = {
  title: 'HR Risk and Compliance Score | The People System',
  description:
    'Free HR Risk and Compliance Score. A 2-minute diagnostic that surfaces your top people risks before they cost you. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/hr-risk-score' },
};

export default function HRRiskScorePage() {
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
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
            }}
          >
            Your HR risk is hidden.<br />
            <span className="text-gradient">
              We surface it before it costs you.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Do you have the right policies in place? Are managers actually following them? Most businesses do not know until something goes wrong. This 2-minute diagnostic surfaces your top people risks before they become expensive problems.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Answer a few quick questions about your current HR setup. Get a scored risk profile with specific recommendations on what to fix first.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Book a Free HR Review <ArrowRight size={16} />
            </Link>
            <Link href="/book" className="btn-secondary">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="max-w-[1200px] mx-auto">
          <HRRiskScoreTool />
        </div>
      </section>
    </div>
  );
}
