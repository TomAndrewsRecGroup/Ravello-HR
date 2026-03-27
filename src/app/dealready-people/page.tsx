import { Metadata } from 'next';
import FaqBlock from '@/components/FaqBlock';
import Link from 'next/link';
import { ArrowRight, CheckCircle, AlertTriangle, Users, FileText, TrendingUp, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DealReady People™ | M&A and Restructure People Advisory | The People System',
  description: 'People due diligence and integration support for M&A, TUPE, and restructures. A specialist project service from The People System: not a retainer product.',
  alternates: { canonical: 'https://ravellohr.co.uk/dealready-people' },
};

const preDealItems = [
  'People due diligence: culture, contracts, liabilities',
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
  { icon: FileText,      title: 'Undisclosed employment liabilities', description: 'Informal pay arrangements, verbal agreements and undocumented practices all become your liabilities the moment the deal completes.',                                        colorClass: 'text-red-500'    },
  { icon: Users,         title: 'Key person flight risk',              description: 'The people the business actually runs on may not stay. Without early identification and a proper retention plan, you can lose them before integration even begins.',           colorClass: 'text-orange-500' },
  { icon: AlertTriangle, title: 'TUPE mismanagement',                  description: 'TUPE is complex and unforgiving. Misstep the consultation or misclassify a transfer and you inherit a queue of tribunal claims.',                                          colorClass: 'text-yellow-600' },
  { icon: TrendingUp,    title: 'Culture collision',                   description: 'Two businesses with different management styles, values and expectations will clash. Without a managed integration plan, you lose the very people you paid for.',      colorClass: 'text-purple-500' },
  { icon: Clock,         title: 'Restructure delay',                   description: 'Post-deal restructures drag when there is no clear process in place. Uncertainty spreads quickly. Good people leave before you have decided who you want to keep.',                          colorClass: 'text-red-600'    },
  { icon: FileText,      title: 'Non-compliant inherited contracts',   description: 'Many SME targets have contracts that would not survive proper scrutiny. You inherit the exposure unless you identify it during due diligence.',                                  colorClass: 'text-blue-500'   },
];

const decisionTree = [
  { question: 'Are you acquiring a business with existing staff?',          answer: 'TUPE almost certainly applies. Get specialist advice before heads of terms are signed.' },
  { question: 'Is the target business founder-led with informal practices?', answer: 'High risk of undocumented agreements and verbal commitments. People due diligence is essential.' },
  { question: 'Will roles be duplicated post-deal?',                         answer: 'Redundancy risk. A clear process needs to be designed before day one, not after.' },
  { question: 'Are you bringing two distinct cultures together?',            answer: 'Integration planning is non-negotiable. Your day one communications strategy can make or break the whole thing.' },
];

export default function DealReadyPeoplePage() {
  return (
    <div className="pt-20">

      {/* Hero: light */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="container-wide">
          <p className="eyebrow mb-5">
            <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--brand-pink)', verticalAlign: 'middle' }} />
            DealReady People™: Specialist Project Service
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
            People due diligence and integration support<br />
            <span style={{ fontWeight: 600, backgroundImage: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              for M&A and restructures.
            </span>
          </h1>
          <p className="text-lg leading-relaxed mb-3 max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            For acquirers, founders going through deals, and PE-backed businesses managing integration or restructure. This is a specialist project service: not a retainer product.
          </p>
          <p className="text-base leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--ink-faint)' }}>
            Financial due diligence finds the numbers. People due diligence finds the problems. Most acquirers skip the second one and pay for it after the deal closes. Lucy handles this from pre-deal risk through to post-deal integration.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-gradient">
              Talk to us about your deal <ArrowRight size={16} />
            </Link>
            <Link href="/tools/due-diligence-checklist" className="btn-secondary">
              Get the People DD Checklist
            </Link>
          </div>
        </div>
      </section>

      {/* Risk grid */}
      <section className="section-padding" style={{ background: 'var(--surface)' }}>
        <div className="container-wide">
          <div className="max-w-[600px] mb-12">
            <h2 className="section-title mb-4">The six people risks that derail deals</h2>
            <p className="text-lg leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Most of these are invisible until after completion. By then they belong to you.
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
          <div className="mt-10 text-center flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-gradient">
              Talk to us about your deal <ArrowRight size={16} />
            </Link>
            <Link href="/tools/due-diligence-checklist" className="btn-secondary">
              Run the Full DD Checklist
            </Link>
          </div>
        </div>
      </section>

      {/* CTA: dark */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className="section-title-light mb-4">In a deal or planning one?</h2>
          <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            The right time to bring in people advisory is before heads of terms are signed. If you are already past that point, the second best time is right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book" className="btn-gradient">
              Talk to us about your deal <ArrowRight size={16} />
            </Link>
            <Link href="/tools/due-diligence-checklist" className="btn-outline-white">
              Download DD Checklist
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqBlock items={[
          { q: 'What is DealReady People?', a: 'A specialist project service from The People System covering people due diligence, TUPE, restructure, and post-deal integration. This is not a retainer product: it is engaged for a specific transaction or restructure.' },
          { q: 'Who is this for?', a: 'Acquirers, founders going through a sale or acquisition, PE-backed businesses managing post-deal integration, and any business facing redundancy or significant restructure.' },
          { q: 'When should we engage?', a: 'The best time is before heads of terms are signed. If you are already past that point, the second best time is right now: before completion.' },
          { q: 'What does TUPE mean for our deal?', a: 'TUPE transfers employment contracts automatically when a business changes hands. Misclassifying a transfer or mismanaging the consultation creates tribunal exposure that belongs to you post-close.' },
          { q: 'Do you work with deal teams and investors?', a: 'Yes. Lucy provides people risk summaries written for board and investor use: not internal HR documents. Clear, commercial, usable in a deal context.' },
          { q: 'What is the pricing?', a: 'DealReady People is priced as a project: from £3,500 for standalone due diligence work, through to full pre-deal and post-deal advisory. Scope and price agreed at the outset: no billing surprises.' },
        ]} />

    
    </div>
  );
}
