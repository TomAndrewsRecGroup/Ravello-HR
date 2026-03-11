import { Metadata } from 'next';
import HRRiskScoreTool from '@/components/tools/HRRiskScoreTool';

export const metadata: Metadata = {
  title: 'HR Risk & Compliance Score | Ravello HR',
  description:
    'Get your free HR Risk & Compliance Score. A 2-minute diagnostic that surfaces your top 3 people risks — before they cost you.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/hr-risk-score' },
};

export default function HRRiskScorePage() {
  return (
    <div className="pt-20">
      <section className="gradient-hero text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <span className="funnel-tag bg-brand-gold text-white mb-4 inline-block">Funnel B · PolicySafe™</span>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            HR Risk & Compliance Score
          </h1>
          <p className="text-white/80 text-lg">
            Do you have the right policies in place? Are managers actually following them? Find out in 2 minutes.
          </p>
        </div>
      </section>
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow">
          <HRRiskScoreTool />
        </div>
      </section>
    </div>
  );
}
