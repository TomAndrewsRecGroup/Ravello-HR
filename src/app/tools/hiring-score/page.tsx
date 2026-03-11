import { Metadata } from 'next';
import HiringScoreTool from '@/components/tools/HiringScoreTool';

export const metadata: Metadata = {
  title: 'Smart Hiring Score | Find Your Hiring Leaks Free',
  description:
    'Answer 12 questions and get your personalised Smart Hiring Score — discover exactly where your hiring is leaking and get a 7/30/90 day fix plan.',
};

export default function HiringScorePage() {
  return (
    <div className="min-h-screen bg-brand-offwhite pt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <span className="funnel-tag bg-brand-teal text-white text-xs mb-4 inline-block">Smart Hiring System™</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy mb-4">
            Your Smart Hiring Score
          </h1>
          <p className="text-brand-slate text-lg max-w-xl mx-auto">
            12 questions. 3 minutes. Find out exactly where your hiring is leaking — and get a personalised fix plan.
          </p>
        </div>
        <HiringScoreTool />
      </div>
    </div>
  );
}
