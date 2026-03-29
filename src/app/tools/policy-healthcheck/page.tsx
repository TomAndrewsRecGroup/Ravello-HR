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
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '4rem', paddingBottom: '3rem' }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="pill pill-purple bg-[var(--brand-purple)] text-white mb-4 inline-block">Funnel B · PolicySafe™</span>
          <h1 className=" text-4xl lg:text-5xl font-bold mb-4">
            Policy & Contract Healthcheck
          </h1>
          <p className="text-white/80 text-lg">
            A quick scan of your HR documents. Walk away with a clear gap list and the language to brief your board.
          </p>
        </div>
      </section>
      <section className="section-padding ">
        <div className="container-narrow">
          <PolicyHealthcheckTool />
        </div>
      </section>
    </div>
  );
}
