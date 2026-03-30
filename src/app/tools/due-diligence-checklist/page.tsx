import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: DealReady People™
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              fontWeight: 300,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              marginBottom: '1.25rem',
            }}
          >
            Acquiring or merging?<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Surface people risk before you sign.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            People risk is the most overlooked part of any deal. Contracts, liabilities, key person dependency, cultural misalignment: miss it in due diligence and it becomes your problem on day one. Run this checklist before you sign.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Work through each section, flag your risk areas, and get a clear picture of what needs resolving before or immediately after completion.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Book a Free DD Review <ArrowRight size={16} />
            </Link>
            <Link href="/book" className="btn-secondary">
              Book a Scoping Call
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="max-w-[1200px] mx-auto">
          <DDChecklistTool />
        </div>
      </section>
    </div>
  );
}
