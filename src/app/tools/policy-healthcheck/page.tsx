import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PolicyHealthcheckTool from '@/components/tools/PolicyHealthcheckTool';
import PageSchema from '@/components/PageSchema';
import AioSummary from '@/components/AioSummary';

export const metadata: Metadata = {
  title: 'Policy and Contract Healthcheck | The People System',
  description:
    'Free Policy and Contract Healthcheck. Find your HR documentation gaps and get a prioritised fix list: before something goes wrong. From The People System.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/tools/policy-healthcheck' },
};

export default function PolicyHealthcheckPage() {
  return (
    <div className="pt-28">
      <PageSchema
        breadcrumbs={[{ name: 'Home', url: '/' }, { name: 'Tools', url: '/tools/policy-healthcheck' }, { name: 'Policy Healthcheck', url: '/tools/policy-healthcheck' }]}
      />

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Free Tool: PolicySafe™
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
            Your policies have gaps.<br />
            <span className="text-gradient">
              Find them before something goes wrong.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            A quick scan of your HR documents. Most businesses are missing at least three critical policies and do not know it until a tribunal or audit forces the issue. Walk away with a clear gap list and the language to brief your board.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Check off what you have, flag what is missing, and get a prioritised fix list you can act on immediately.
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
            what="A 15-policy checklist covering contracts, handbook, disciplinary, grievance, absence, equality, hybrid, GDPR, H&S, parental leave, performance, redundancy, whistleblowing, social media and expenses."
            who="UK SME founders and HR leads who suspect their policy stack is incomplete or out of date."
            problem="Most businesses are missing at least three critical policies. Each gap is a tribunal or HSE exposure waiting to land. The Employment Rights Bill makes existing gaps worse."
            next="Submit your details to receive a branded gap report by email, prioritised by legal risk, with PolicySafe as the canonical fix."
          />
        </div>
      </section>

      <section className="section-padding">
        <div className="max-w-[1200px] mx-auto">
          <PolicyHealthcheckTool />
        </div>
      </section>
    </div>
  );
}
