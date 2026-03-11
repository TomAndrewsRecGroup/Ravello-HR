import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, Users, FileText, TrendingUp, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DealReady People™ | M&A HR & Change Management | Ravello HR',
  description:
    'People risk is the #1 reason acquisitions fail. DealReady People™ by Ravello HR manages people due diligence, TUPE, restructuring and culture integration.',
  alternates: { canonical: 'https://ravellohr.co.uk/dealready-people' },
};

const preDealItems = [
  'People due diligence — culture, contracts, liabilities',
  'Hidden cost identification (holiday accrual, tribunal risk, informal agreements)',
  'TUPE applicability assessment',
  'Key person dependency mapping',
  'Org structure comparison and gap analysis',
  'People risk summary for deal team / board',
];

const postDealItems = [
  'TUPE transfer management and communications',
  'Redundancy and restructure process design',
  'New contract and handbook rollout',
  'Culture integration planning',
  'Manager briefing and change comms support',
  'HR policy harmonisation across entities',
];

const risks = [
  {
    icon: FileText,
    title: 'Undisclosed employment liabilities',
    description: 'Informal pay arrangements, verbal agreements and undocumented practices become your liabilities the moment the deal closes.',
    color: 'text-red-500',
  },
  {
    icon: Users,
    title: 'Key person flight risk',
    description: 'The people the target business runs on may not stay. Without early identification and retention planning, you can lose them before integration starts.',
    color: 'text-orange-500',
  },
  {
    icon: AlertTriangle,
    title: 'TUPE mismanagement',
    description: 'TUPE is complex and unforgiving. Misstep the consultation or misclassify a transfer and you inherit a tribunal queue.',
    color: 'text-yellow-600',
  },
  {
    icon: TrendingUp,
    title: 'Culture collision',
    description: 'Two businesses with different management styles, values and expectations will clash. Without a managed integration plan, you lose the people you paid for.',
    color: 'text-purple-500',
  },
  {
    icon: Clock,
    title: 'Restructure delay',
    description: 'Post-deal restructures drag when there’s no clear process. Uncertainty leaks. Good people leave before you’ve decided who to keep.',
    color: 'text-red-600',
  },
  {
    icon: FileText,
    title: 'Non-compliant inherited contracts',
    description: 'Many SME targets have contracts that wouldn’t survive scrutiny. You inherit exposure unless you identify it in due diligence.',
    color: 'text-brand-slate',
  },
];

const decisionTree = [
  { question: 'Are you acquiring a business with existing staff?', answer: 'TUPE almost certainly applies. Get advice before heads of terms.' },
  { question: 'Is the target business founder-led with informal practices?', answer: 'High risk of undocumented agreements. Needs people due diligence.' },
  { question: 'Will roles be duplicated post-deal?', answer: 'Redundancy risk. Process design needed before day one.' },
  { question: 'Are you merging two distinct cultures?', answer: 'Integration planning required. Day one comms strategy is critical.' },
];

export default function DealReadyPeoplePage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="gradient-hero text-white py-20 lg:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <span className="funnel-tag bg-white/20 border border-white/30 text-white mb-6 inline-block">DealReady People™</span>
          <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            People risk is the #1 reason<br />
            <span className="text-gradient">acquisitions fail.</span>
          </h1>
          <p className="text-white/80 text-xl mb-4 max-w-2xl">
            Financial due diligence finds the numbers. People due diligence finds the problems. Most acquirers skip the second one — and pay for it after the deal closes.
          </p>
          <p className="text-white/70 text-lg mb-10 max-w-2xl">
            DealReady People™ supports your transaction from pre-deal people risk through to post-deal integration — so your investment performs the way it should.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/tools/due-diligence-checklist" className="btn-primary text-base">
              Get the People DD Checklist <ArrowRight size={18} />
            </Link>
            <Link href="/book" className="btn-outline text-base border-white text-white hover:bg-white hover:text-brand-navy">
              Talk to Lucinda
            </Link>
          </div>
        </div>
      </section>

      {/* Risk grid */}
      <section className="section-padding bg-white">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              The 6 people risks that derail deals
            </h2>
            <p className="text-brand-slate text-lg max-w-2xl mx-auto">
              Most of these are invisible until after the deal completes. By then they’re your problem.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {risks.map((risk) => (
              <div key={risk.title} className="card">
                <risk.icon className={`${risk.color} mb-3`} size={26} />
                <h3 className="font-display font-bold text-lg text-brand-navy mb-2">{risk.title}</h3>
                <p className="text-brand-slate text-sm leading-relaxed">{risk.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pre vs Post deal */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-navy mb-4">
              What we do at each stage
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Pre-deal */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-brand-teal flex items-center justify-center text-white font-bold text-sm">Pre</div>
                <h3 className="font-display font-bold text-xl text-brand-navy">Before the deal closes</h3>
              </div>
              <ul className="space-y-3">
                {preDealItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="text-brand-teal flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-brand-slate text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Post-deal */}
            <div className="bg-brand-navy rounded-2xl p-8 text-white shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center text-white font-bold text-sm">Post</div>
                <h3 className="font-display font-bold text-xl">After the deal closes</h3>
              </div>
              <ul className="space-y-3">
                {postDealItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="text-brand-gold flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-white/80 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Restructure decision tree */}
      <section className="section-padding bg-white">
        <div className="container-narrow">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl font-bold text-brand-navy mb-4">
              Quick risk pre-check
            </h2>
            <p className="text-brand-slate text-lg">
              Answer these four questions. If any apply, you need people advisory before you proceed.
            </p>
          </div>
          <div className="space-y-4">
            {decisionTree.map((item, i) => (
              <div key={i} className="bg-brand-offwhite rounded-xl p-5 border border-gray-200">
                <p className="font-semibold text-brand-navy mb-2">❓ {item.question}</p>
                <p className="text-brand-teal text-sm font-medium">→ {item.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/tools/due-diligence-checklist" className="btn-primary">
              Run the Full DD Checklist <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-brand-navy text-white">
        <div className="container-narrow text-center">
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">
            In a deal or planning one?
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            The best time to bring in people advisory is before heads of terms. The second best time is right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-primary">
              Book a Confidential Call <ArrowRight size={18} />
            </Link>
            <Link href="/tools/due-diligence-checklist" className="btn-outline border-white text-white hover:bg-white hover:text-brand-navy">
              Download DD Checklist
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
