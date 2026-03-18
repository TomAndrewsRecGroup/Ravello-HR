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
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '4rem', paddingBottom: '3rem' }}">
        <div className="max-w-3xl mx-auto text-center">
          <span className="pill pill-purple bg-[var(--brand-purple)] text-white mb-4 inline-block">Funnel A · Smart Hiring System™</span>
          <h1 className=" text-4xl lg:text-5xl font-bold mb-4">
            Your Smart Hiring Score
          </h1>
          <p className="text-white/80 text-lg">
            Answer 10 questions. Find out exactly where roles stall, candidates drop off, and agency spend creeps back in.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="container-narrow">
          <HiringScoreTool />
        </div>
      </section>
    </div>
  );
}
