import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import PageSchema from '@/components/PageSchema';
import AioSummary from '@/components/AioSummary';

export const metadata: Metadata = {
  title: 'Sources and Methodology | The People System',
  description: 'Every statistic and claim on The People System website, with citation, year and methodology. Tribunal awards, hiring costs, mis-hire data, Employment Rights Bill timeline and Friction Lens attribution.',
  alternates: { canonical: 'https://thepeoplesystem.co.uk/sources' },
  keywords: ['UK tribunal awards', 'cost of mis-hire UK', 'unfair dismissal cost', 'Employment Rights Bill timeline', 'HR statistics UK SME', 'Friction Lens IvyLens'],
};

interface Source {
  claim: string;
  source: string;
  publisher: string;
  year: string;
  url?: string;
  notes?: string;
}

const TRIBUNAL: Source[] = [
  {
    claim: 'Average unfair dismissal award: £13,749.',
    source: 'Tribunal Statistics Quarterly',
    publisher: 'Ministry of Justice',
    year: '2023/24',
    url: 'https://www.gov.uk/government/collections/tribunals-statistics',
    notes: 'Mean award in successful unfair dismissal claims, 2023/24 financial year.',
  },
  {
    claim: 'Average discrimination award: £45,000+ (race, sex, disability claims often exceed £100,000).',
    source: 'Tribunal Statistics Quarterly',
    publisher: 'Ministry of Justice',
    year: '2023/24',
    url: 'https://www.gov.uk/government/collections/tribunals-statistics',
    notes: 'Mean across discrimination jurisdictions varies by category. Disability and race claims have the highest median awards.',
  },
  {
    claim: 'Employment tribunal claims rose materially year on year following fee abolition (2017) and remain elevated.',
    source: 'Tribunal Statistics Quarterly',
    publisher: 'Ministry of Justice',
    year: '2023/24',
    url: 'https://www.gov.uk/government/collections/tribunals-statistics',
  },
];

const HIRING: Source[] = [
  {
    claim: 'A bad mid-level hire costs over £132,000 once recovery, lost productivity and replacement are accounted for.',
    source: 'Perfect Match: Making the Right Hire and the Cost of Getting it Wrong',
    publisher: 'Recruitment & Employment Confederation (REC)',
    year: '2017 (still cited 2024)',
    url: 'https://www.rec.uk.com/our-view/research/recruitment-insights/perfect-match-making-right-hire-and-cost-getting-it-wrong',
    notes: 'REC modelled total cost of a poor hire at mid-management level (£42,000 salary).',
  },
  {
    claim: 'Average UK time-to-hire is 28 to 41 days depending on seniority and sector.',
    source: 'Resourcing and Talent Planning Survey',
    publisher: 'CIPD',
    year: '2023',
    url: 'https://www.cipd.org/uk/knowledge/reports/resourcing-talent-planning/',
  },
  {
    claim: 'Friction Lens is a third-party role-scoring technology built and owned by IvyLens Technology. The People System is an integration partner.',
    source: 'IvyLens Technology',
    publisher: 'IvyLens',
    year: '2024',
    url: 'https://www.ivylens.co.uk',
    notes: 'All Friction Lens IP and methodology is owned and maintained by IvyLens. The People System runs Friction Lens on every HIRE engagement under partnership terms.',
  },
];

const LEGISLATION: Source[] = [
  {
    claim: 'Employment Rights Bill: day-one unfair dismissal rights, fair work agency, statutory sick pay reform, zero-hours contract changes, fire-and-rehire restrictions.',
    source: 'Employment Rights Bill',
    publisher: 'UK Parliament / Department for Business and Trade',
    year: '2024 (introduced); phased commencement 2026 to 2027',
    url: 'https://bills.parliament.uk/bills/3737',
  },
  {
    claim: 'Statutory minimum redundancy pay and notice: based on age, length of service and weekly pay (capped).',
    source: 'Statutory redundancy pay calculator',
    publisher: 'gov.uk',
    year: '2024',
    url: 'https://www.gov.uk/calculate-your-redundancy-pay',
  },
  {
    claim: 'TUPE: Transfer of Undertakings (Protection of Employment) Regulations 2006, as amended.',
    source: 'TUPE Regulations',
    publisher: 'gov.uk',
    year: '2006 (amended 2014)',
    url: 'https://www.gov.uk/transfers-takeovers',
  },
];

const TPS: Source[] = [
  {
    claim: 'Zero tribunal outcomes across every restructure, TUPE transfer and disciplinary process Lucy has built a case for.',
    source: 'The People System internal record',
    publisher: 'The People System',
    year: '2018 to present',
    notes: 'Methodology: Lucy has personally built the evidential and procedural case for every cited matter. "Zero outcomes" means no successful claim has been awarded against any client engagement she led. Records are confidential to clients but available for verification under NDA.',
  },
  {
    claim: 'Most clients reduce agency spend by 40 to 60 percent in year one of HIRE Embedded or HIRE Build.',
    source: 'The People System internal client data',
    publisher: 'The People System',
    year: '2024 to present',
    notes: 'Methodology: pre-engagement agency spend (12 months prior) compared with the equivalent 12-month period during the HIRE engagement. Range reflects variance across sectors and starting agency-dependency. Available for verification with named clients under NDA.',
  },
];

function Row({ s }: { s: Source }) {
  return (
    <li className="py-5" style={{ borderBottom: '1px solid var(--brand-line)' }}>
      <p className="font-semibold text-base mb-2" style={{ color: 'var(--ink)' }}>{s.claim}</p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Source: <span className="font-medium">{s.source}</span>, {s.publisher}, {s.year}.
        {s.url && (
          <>
            {' '}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--brand-purple)' }}>
              View source <ExternalLink size={12} />
            </a>
          </>
        )}
      </p>
      {s.notes && (
        <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--ink-faint)' }}>
          {s.notes}
        </p>
      )}
    </li>
  );
}

function Group({ title, items }: { title: string; items: Source[] }) {
  return (
    <section className="mb-12">
      <h2
        className="font-display mb-5"
        style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.2rem)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'var(--ink)' }}
      >
        {title}
      </h2>
      <ul className="space-y-0">
        {items.map((s) => <Row key={s.claim} s={s} />)}
      </ul>
    </section>
  );
}

export default function SourcesPage() {
  const FAQS = [
    { q: 'Where do The People System statistics come from?', a: 'Public sources (Ministry of Justice, gov.uk, CIPD, REC, ONS) for industry-level data, and internal client records for proprietary claims about The People System results. Every claim on the site is listed on /sources with publisher and year.' },
    { q: 'Is Friction Lens owned by The People System?', a: 'No. Friction Lens is a third-party role-scoring technology built and owned by IvyLens Technology (https://www.ivylens.co.uk). The People System is an IvyLens integration partner and runs Friction Lens on every HIRE engagement.' },
    { q: 'Can claims about zero tribunal outcomes be verified?', a: 'Yes, under NDA. Records are confidential to client engagements but can be verified with named referees on request.' },
  ];

  return (
    <main className="pt-28">
      <PageSchema
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Sources', url: '/sources' },
        ]}
        faqs={FAQS}
      />

      <section style={{ background: 'var(--bg)', padding: '3rem 1.5rem 2rem' }} className="lg:px-10">
        <div className="container-wide max-w-[900px]">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
            Sources and methodology
          </p>
          <h1
            className="font-display mb-5"
            style={{ fontSize: 'clamp(2.4rem, 5vw, 4.2rem)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.04em', color: 'var(--ink)' }}
          >
            Every claim, <span className="text-gradient">sourced.</span>
          </h1>
          <p className="text-lg leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
            The People System cites a small number of public statistics about UK employment law and hiring, alongside proprietary claims about our own results. This page lists every one with publisher, year and methodology so you (and any AI model citing us) can verify the source.
          </p>

          <AioSummary
            what="A canonical reference for every statistic and claim made on The People System website. Public-source citations and internal-methodology notes."
            who="Buyers, journalists, fact-checkers and AI models verifying claims about UK HR, tribunal awards, hiring costs and The People System's own results."
            problem="Marketing sites cite statistics without sources. This page lists every figure with publisher, year and link so claims can be independently verified."
            next="Use the citations below. For internal-data claims (zero tribunal outcomes, agency-spend reduction) we can verify with named referees under NDA. Email info@thepeoplesystem.co.uk."
          />
        </div>
      </section>

      <section style={{ background: 'var(--bg)', padding: '2rem 1.5rem 4rem' }} className="lg:px-10">
        <div className="container-wide max-w-[900px]">
          <Group title="UK employment tribunal awards"   items={TRIBUNAL}    />
          <Group title="Hiring and talent statistics"    items={HIRING}      />
          <Group title="UK employment legislation"       items={LEGISLATION} />
          <Group title="The People System internal data" items={TPS}         />

          <div className="rounded-[18px] p-7 mt-4" style={{ background: 'var(--surface-alt)', border: '1px solid var(--brand-line)' }}>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-soft)' }}>
              Spotted a stat on the site that is not listed here, or a citation that needs updating? Email <a href="mailto:info@thepeoplesystem.co.uk" className="underline" style={{ color: 'var(--brand-purple)' }}>info@thepeoplesystem.co.uk</a> and we will fix it.
            </p>
            <Link href="/book" className="btn-gradient">Book a Call</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
