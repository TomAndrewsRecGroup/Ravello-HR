import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import DDChecklistTool from '@/components/tools/DDChecklistTool';
import PageSchema from '@/components/PageSchema';
import AioSummary from '@/components/AioSummary';

export const metadata: Metadata = {
  title: 'People Due Diligence Checklist | M&A People Risk | The People System',
  description:
    'Free People Due Diligence Checklist for M&A and restructures. Identify people risk before and after acquisition. Interactive and downloadable. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/due-diligence-checklist' },
};

export default function DDChecklistPage() {
  return (
    <div className="pt-28">
      <PageSchema
        breadcrumbs={[{ name: 'Home', url: '/' }, { name: 'Tools', url: '/tools/due-diligence-checklist' }, { name: 'DD Checklist', url: '/tools/due-diligence-checklist' }]}
      />

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: DealReady People™
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
            Acquiring or merging?<br />
            <span className="text-gradient">
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
            <Link href="/book" className="btn-gradient">Book a Call</Link>
            <Link href="/book" className="btn-secondary">Book a Call</Link>
          </div>
        </div>
      </section>

      <section className="section-padding" style={{ paddingTop: '0', paddingBottom: '2rem' }}>
        <div className="max-w-[900px] mx-auto">
          <AioSummary
            what="A 19-point people due diligence checklist across workforce structure, employment terms, retention, comp and benefits, and post-acquisition integration."
            who="UK PE-backed acquirers, founder sellers and integration leads working on M&A or carve-outs."
            problem="People risk surfaces too late: TUPE timelines slip, key staff walk in week one, contracts harmonisation drags into year two. Most deals never run a structured people DD."
            next="Submit your details to receive a branded risk summary with the open items mapped to deal stage and DealReady People as the canonical fix."
          />
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
