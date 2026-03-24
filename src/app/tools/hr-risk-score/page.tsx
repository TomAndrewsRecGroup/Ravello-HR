import { Metadata } from 'next';
import HRRiskScoreTool from '@/components/tools/HRRiskScoreTool';

export const metadata: Metadata = {
  title: 'HR Risk and Compliance Score | The People Office',
  description:
    'Free HR Risk and Compliance Score. A 2-minute diagnostic that surfaces your top people risks before they cost you. From The People Office.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/hr-risk-score' },
};

export default function HRRiskScorePage() {
  return (
    <div className="pt-20">
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '4rem', paddingBottom: '3rem' }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="pill pill-purple bg-[var(--brand-purple)] text-white mb-4 inline-block">Funnel B · PolicySafe™</span>
          <h1 className=" text-4xl lg:text-5xl font-bold mb-4">
            HR Risk & Compliance Score
          </h1>
          <p className="text-white/80 text-lg">
            Do you have the right policies in place? Are managers actually following them? Find out in 2 minutes.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="container-narrow">
          <HRRiskScoreTool />
        </div>
      </section>
    </div>
  );
}
