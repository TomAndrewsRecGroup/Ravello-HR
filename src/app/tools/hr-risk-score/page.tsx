import { Metadata } from 'next';
import HRRiskScoreTool from '@/components/tools/HRRiskScoreTool';

export const metadata: Metadata = {
  title: 'HR Risk & Compliance Score | Ravello HR',
  description:
    'A 2-minute diagnostic that scores your HR risk exposure across policies, contracts, management practices and absence management.',
};

export default function HRRiskScorePage() {
  return (
    <div className="min-h-screen bg-brand-offwhite pt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <span className="funnel-tag bg-brand-gold text-white text-xs mb-4 inline-block">PolicySafe™</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy mb-4">
            HR Risk & Compliance Score
          </h1>
          <p className="text-brand-slate text-lg max-w-xl mx-auto">
            Answer 10 questions. Get your compliance risk score, top 3 exposures, and recommended next steps.
          </p>
        </div>
        <HRRiskScoreTool />
      </div>
    </div>
  );
}
