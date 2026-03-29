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
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '4rem', paddingBottom: '3rem' }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="pill pill-purple bg-[var(--brand-navy)] border border-white/30 text-white mb-4 inline-block">Funnel C · DealReady People™</span>
          <h1 className=" text-4xl lg:text-5xl font-bold mb-4">
            People Due Diligence Checklist
          </h1>
          <p className="text-white/80 text-lg">
            Acquiring or merging? Run this checklist before you sign. Surface people risk before it becomes your problem.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="container-narrow">
          <DDChecklistTool />
        </div>
      </section>
    </div>
  );
}
