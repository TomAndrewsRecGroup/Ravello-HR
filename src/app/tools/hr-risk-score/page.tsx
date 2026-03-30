import { Metadata } from 'next';
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
            HR Risk &amp; Compliance Score
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Do you have the right policies in place? Are managers actually following them? Find out in 2 minutes.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="max-w-[1200px] mx-auto">
          <HRRiskScoreTool />
        </div>
      </section>
    </div>
  );
}
