import { Metadata } from 'next';
import PolicyHealthcheckTool from '@/components/tools/PolicyHealthcheckTool';

export const metadata: Metadata = {
  title: 'Policy and Contract Healthcheck | The People System',
  description:
    'Free Policy and Contract Healthcheck. Find your HR documentation gaps and get a prioritised fix list: before something goes wrong. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/policy-healthcheck' },
};

export default function PolicyHealthcheckPage() {
  return (
    <div className="pt-28">
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: PolicySafe™
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
            Policy &amp; Contract Healthcheck
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            A quick scan of your HR documents. Walk away with a clear gap list and the language to brief your board.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="max-w-[1200px] mx-auto">
          <PolicyHealthcheckTool />
        </div>
      </section>
    </div>
  );
}
