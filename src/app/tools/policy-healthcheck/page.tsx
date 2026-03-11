import { Metadata } from 'next';
import PolicyHealthcheckTool from '@/components/tools/PolicyHealthcheckTool';

export const metadata: Metadata = {
  title: 'Policy & Contract Healthcheck | Ravello HR',
  description:
    'Run a free Policy & Contract Healthcheck. Get a personalised gap list you can take straight to your board or leadership team.',
  alternates: { canonical: 'https://ravellohr.co.uk/tools/policy-healthcheck' },
};

export default function PolicyHealthcheckPage() {
  return (
    <div className="pt-20">
      <section className="gradient-hero text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <span className="funnel-tag bg-brand-gold text-white mb-4 inline-block">Funnel B · PolicySafe™</span>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            Policy & Contract Healthcheck
          </h1>
          <p className="text-white/80 text-lg">
            A quick scan of your HR documents. Walk away with a clear gap list and the language to brief your board.
          </p>
        </div>
      </section>
      <section className="section-padding bg-brand-offwhite">
        <div className="container-narrow">
          <PolicyHealthcheckTool />
        </div>
      </section>
    </div>
  );
}
