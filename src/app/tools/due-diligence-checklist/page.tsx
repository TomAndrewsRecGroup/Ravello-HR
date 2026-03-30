import { Metadata } from 'next';
import DDChecklistTool from '@/components/tools/DDChecklistTool';

export const metadata: Metadata = {
  title: 'People Due Diligence Checklist | M&A People Risk | The People System',
  description:
    'Free People Due Diligence Checklist for M&A and restructures. Identify people risk before and after acquisition. Interactive and downloadable. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/due-diligence-checklist' },
};

export default function DDChecklistPage() {
  return (
    <div className="pt-28">
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: DealReady People™
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
            People Due Diligence Checklist
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Acquiring or merging? Run this checklist before you sign. Surface people risk before it becomes your problem.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="max-w-[1200px] mx-auto">
          <DDChecklistTool />
        </div>
      </section>
    </div>
  );
}
