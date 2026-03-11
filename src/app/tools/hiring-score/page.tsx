import { Metadata } from 'next';
import HiringScoreTool from '@/components/tools/HiringScoreTool';

export const metadata: Metadata = {
  title: 'Smart Hiring Score | Ravello HR',
  description:
    'Find out exactly where your hiring is leaking. Get your Smart Hiring Score in under 3 minutes — instant results, no fluff.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/hiring-score' },
};

export default function HiringScorePage() {
  return (
    <div className="pt-20">
      <section className="gradient-hero text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <span className="funnel-tag bg-brand-teal text-white mb-4 inline-block">Funnel A · Smart Hiring System™</span>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            Your Smart Hiring Score
          </h1>
          <p className="text-white/80 text-lg">
            Answer 10 questions. Find out exactly where roles stall, candidates drop off, and agency spend creeps back in.
          </p>
        </div>
      </section>
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow">
          <HiringScoreTool />
        </div>
      </section>
    </div>
  );
}
