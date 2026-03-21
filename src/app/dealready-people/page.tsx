import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, Users, FileText, TrendingUp, Clock } from 'lucide-react';
import ProductHeroElevated from '@/components/ProductHeroElevated';

export const metadata: Metadata = {
  title: 'DealReady People™ | M&A HR & Change Management | Ravello HR',
  description: 'People risk is the #1 reason acquisitions fail. DealReady People™ by Ravello HR manages people due diligence, TUPE, restructuring and culture integration.',
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
  { icon: FileText,      title: 'Undisclosed employment liabilities', description: 'Informal pay arrangements, verbal agreements and undocumented practices become your liabilities the moment the deal closes.',                                        colorClass: 'text-red-500'    },
  { icon: Users,         title: 'Key person flight risk',              description: 'The people the target business runs on may not stay. Without early identification and retention planning, you can lose them before integration starts.',           colorClass: 'text-orange-500' },
  { icon: AlertTriangle, title: 'TUPE mismanagement',                  description: 'TUPE is complex and unforgiving. Misstep the consultation or misclassify a transfer and you inherit a tribunal queue.',                                          colorClass: 'text-yellow-600' },
  { icon: TrendingUp,    title: 'Culture collision',                   description: 'Two businesses with different management styles, values and expectations will clash. Without a managed integration plan, you lose the people you paid for.',      colorClass: 'text-purple-500' },
  { icon: Clock,         title: 'Restructure delay',                   description: 'Post-deal restructures drag when there\'s no clear process. Uncertainty leaks. Good people leave before you\'ve decided who to keep.',                          colorClass: 'text-red-600'    },
  { icon: FileText,      title: 'Non-compliant inherited contracts',   description: 'Many SME targets have contracts that wouldn\'t survive scrutiny. You inherit exposure unless you identify it in due diligence.',                                  colorClass: 'text-blue-500'   },
];

const decisionTree = [
  { question: 'Are you acquiring a business with existing staff?',          answer: 'TUPE almost certainly applies. Get advice before heads of terms.' },
  { question: 'Is the target business founder-led with informal practices?', answer: 'High risk of undocumented agreements. Needs people due diligence.' },
  { question: 'Will roles be duplicated post-deal?',                         answer: 'Redundancy risk. Process design needed before day one.' },
  { question: 'Are you merging two distinct cultures?',                      answer: 'Integration planning required. Day one comms strategy is critical.' },
];

export default function DealReadyPeoplePage() {
  return (
    <div>
      <ProductHeroElevated
        eyebrow="DealReady People™"
        title="People risk is the #1 reason acquisitions fail."
        subtitle="Get people advisory before heads of terms."
        description="Financial due diligence finds the numbers. People due diligence finds the problems. Most acquirers skip the second one — and pay for it after the deal closes. DealReady People™ supports your transaction from pre-deal risk through to post-deal integration."
        ctaText="Book a Confidential Call"
      />

      {/* Risk grid */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">The 6 people risks that derail deals</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Most of these are invisible until after the deal completes. By then they&rsquo;re your problem.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {risks.map((risk) => (
              <div key={risk.title} className="card">
                <risk.icon className={`${risk.colorClass} mb-3`} size={24} />
                <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>{risk.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{risk.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pre vs post deal */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="text-center mb-12">
            <h2 className="section-title mb-4">What we do at each stage</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-[18px] p-8" style={{ border: '1px solid var(--brand-line)', boxShadow: '0 2px 8px rgba(13,21,53,0.04)' }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--brand-purple)' }}>Pre</div>
                <h3 className="font-bold text-xl" style={{ color: 'var(--ink)', fontFamily: 'var(--font-cormorant), serif', fontWeight: 600 }}>Before the deal closes</h3>
              </div>
              <ul className="space-y-3">
                {preDealItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="flex-shrink-0 mt-0.5" size={16} style={{ color: 'var(--brand-purple)' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[18px] p-8 text-white" style={{ background: 'var(--brand-navy)' }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'rgba(155,111,216,0.6)' }}>Post</div>
                <h3 className="font-bold text-xl" style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 600 }}>After the deal closes</h3>
              </div>
              <ul className="space-y-3">
                {postDealItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="flex-shrink-0 mt-0.5" size={16} style={{ color: '#9B6FD8' }} />
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Quick risk pre-check */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-narrow">
          <div className="text-center mb-10">
            <h2 className="section-title mb-4">Quick risk pre-check</h2>
            <p className="text-lg" style={{ color: 'var(--ink-soft)' }}>
              Answer these four questions. If any apply, you need people advisory before you proceed.
            </p>
          </div>
          <div className="space-y-4">
            {decisionTree.map((item, i) => (
              <div key={i} className="rounded-[14px] p-5" style={{ background: 'var(--bg)', border: '1px solid var(--brand-line)' }}>
                <p className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>❓ {item.question}</p>
                <p className="text-sm font-medium" style={{ color: 'var(--brand-purple)' }}>→ {item.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/tools/due-diligence-checklist" className="btn-gradient">
              Run the Full DD Checklist <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA — dark */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title-light mb-4">In a deal or planning one?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            The best time to bring in people advisory is before heads of terms. The second best time is right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-gradient">
              Book a Confidential Call <ArrowRight size={16} />
            </Link>
            <Link href="/tools/due-diligence-checklist" className="btn-outline-white">
              Download DD Checklist
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
          { q: 'What is DealReady People?', a: 'A people advisory service that manages HR risk before and after acquisitions.' },
          { q: 'When should we engage?', a: 'The best time is before heads of terms. The second best time is right now.' },
          { q: 'What does TUPE mean for our deal?', a: 'TUPE transfers employment contracts automatically when a business changes hands. Mismanaging it creates tribunal risk.' },
          { q: 'Do you work with investors and deal teams?', a: 'Yes. Ravello provides people risk summaries suitable for board and investor use.' },
          { q: 'What happens post-close?', a: 'Ravello supports TUPE transfer management, redundancy process design, contract harmonisation, and culture integration planning.' },
        ]} />

    
    </div>
  );
}
