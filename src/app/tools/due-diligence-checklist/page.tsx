import { Metadata } from 'next';
import DDChecklistTool from '@/components/tools/DDChecklistTool';

export const metadata: Metadata = {
  title: 'People Due Diligence Checklist | DealReady People™',
  description:
    'The Ravello HR People Due Diligence Checklist — interactive version. Score your pre-acquisition people risk before the deal closes.',
};

export default function DDChecklistPage() {
  return (
    <div className="min-h-screen bg-brand-offwhite pt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <span className="funnel-tag bg-brand-navy text-white text-xs mb-4 inline-block">DealReady People™</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy mb-4">
            People Due Diligence Checklist
          </h1>
          <p className="text-brand-slate text-lg max-w-xl mx-auto">
            The pre-acquisition people risk checklist used on real deals. Interactive version with scoring and risk flags.
          </p>
        </div>
        <DDChecklistTool />
      </div>
    </div>
  );
}
