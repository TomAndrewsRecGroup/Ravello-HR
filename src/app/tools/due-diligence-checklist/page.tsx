import { Metadata } from 'next';
import DDChecklistTool from '@/components/tools/DDChecklistTool';

export const metadata: Metadata = {
  title: 'People Due Diligence Checklist | Ravello HR',
  description:
    'Free People Due Diligence Checklist for M&A. Identify people risk before and after acquisition — interactive and downloadable.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/due-diligence-checklist' },
};

export default function DDChecklistPage() {
  return (
    <div className="pt-20">
      <section className="gradient-hero text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <span className="funnel-tag bg-brand-navy border border-white/30 text-white mb-4 inline-block">Funnel C · DealReady People™</span>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            People Due Diligence Checklist
          </h1>
          <p className="text-white/80 text-lg">
            Acquiring or merging? Run this checklist before you sign. Surface people risk before it becomes your problem.
          </p>
        </div>
      </section>
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow">
          <DDChecklistTool />
        </div>
      </section>
    </div>
  );
}
