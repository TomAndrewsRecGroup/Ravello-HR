import { Metadata } from 'next';
import HiringScoreTool from '@/components/tools/HiringScoreTool';

export const metadata: Metadata = {
  title: 'Hiring Score | Diagnose Your Hiring Problems | The People Office',
  description:
    'Find out exactly where your hiring is breaking down. Get your Hiring Score in under 3 minutes — instant results, no fluff. Free diagnostic from The People Office.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/hiring-score' },
};

export default function HiringScorePage() {
  return (
    <div className="pt-20">
      <section className="section-sm" style={{ background: 'var(--bg)', paddingTop: '4rem' }}>
        <div className="container-narrow text-center">
          <p className="eyebrow justify-center mb-4">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Smart Hiring System™
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(2.2rem, 4.5vw, 3.8rem)',
              fontWeight: 300,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              marginBottom: '1rem',
            }}
          >
            How strong is your{' '}
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              hiring process?
            </span>
          </h1>
          <p className="text-base leading-relaxed max-w-[520px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Answer 8 questions. Find out exactly where roles stall, candidates drop off, and agency spend keeps coming back.
          </p>
        </div>
      </section>
      <section className="section-padding" style={{ paddingTop: '2rem' }}>
        <div className="container-narrow">
          <HiringScoreTool />
        </div>
      </section>
    </div>
  );
}
