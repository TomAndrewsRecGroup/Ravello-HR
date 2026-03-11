import { Metadata } from 'next';
import PolicyHealthcheckTool from '@/components/tools/PolicyHealthcheckTool';

export const metadata: Metadata = {
  title: 'Policy & Contract Healthcheck | PolicySafe™ by Ravello HR',
  description:
    'A free policy gap scan for small and growing businesses. See which HR documents you\'re missing and the risk each gap creates.',
};

export default function PolicyHealthcheckPage() {
  return (
    <div className="min-h-screen bg-brand-offwhite pt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <span className="funnel-tag bg-brand-gold text-white text-xs mb-4 inline-block">PolicySafe™</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy mb-4">
            Policy & Contract Healthcheck
          </h1>
          <p className="text-brand-slate text-lg max-w-xl mx-auto">
            Tell us which documents you have. We\'ll output a gap list with the legal risk of each gap — and the fix.
          </p>
        </div>
        <PolicyHealthcheckTool />
      </div>
    </div>
  );
}
