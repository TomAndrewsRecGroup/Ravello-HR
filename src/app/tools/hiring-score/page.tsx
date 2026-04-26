import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import HiringScoreTool from '@/components/tools/HiringScoreTool';

export const metadata: Metadata = {
  title: 'Hiring Score | Diagnose Your Hiring Problems | The People System',
  description:
    'Find out exactly where your hiring is breaking down. Get your Hiring Score in under 3 minutes: instant results, no fluff. Free diagnostic from The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/hiring-score' },
};

export default function HiringScorePage() {
  return (
    <div className="pt-28">

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: Smart Hiring System™
          </p>
          <h1
            className="font-display mb-5"
            style={{
              fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
            }}
          >
            How strong is your hiring process?<br />
            <span className="text-gradient">
              Find out in 3 minutes.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Answer 8 questions about how you hire today. Find out exactly where roles stall, candidates drop off, and agency spend keeps coming back. Instant results, no fluff.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Your score highlights the specific failure points in your current process and tells you what to fix first.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">Book a Call</Link>
            <Link href="/book" className="btn-secondary">Book a Call</Link>
          </div>
        </div>
      </section>

      <section className="section-padding" style={{ paddingTop: '2rem' }}>
        <div className="max-w-[1200px] mx-auto">
          <HiringScoreTool />
        </div>
      </section>
    </div>
  );
}
