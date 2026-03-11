import Link from 'next/link';
import { ArrowRight, Users, Shield, TrendingUp } from 'lucide-react';

const funnels = [
  {
    tag: 'Smart Hiring System™',
    tagBg: 'bg-brand-teal',
    icon: Users,
    headline: 'Hiring broken? Fix the leak before it costs you again.',
    body: 'Stop reopening roles. Stop agency dependency. The Smart Hiring System gives your managers the framework they\'re missing — scored, structured, and results-proven.',
    pain: 'You\'ve hired the wrong person — twice. Your last agency invoice was eye-watering. Your managers interview by gut feel.',
    cta: 'Get My Hiring Score',
    ctaHref: '/tools/hiring-score',
    learnHref: '/smart-hiring-system',
    color: 'from-brand-teal/10 to-transparent',
    borderColor: 'border-brand-teal/30',
  },
  {
    tag: 'PolicySafe™',
    tagBg: 'bg-brand-gold',
    icon: Shield,
    headline: 'Compliant HR docs. In days, not months.',
    body: 'Outdated contracts. Missing handbooks. Policies that open you to claims. PolicySafe™ gives small and growing businesses the compliance foundation they need — built properly.',
    pain: 'Your employment contracts are from 2019. You\'re not sure if your handbook covers hybrid work. One tribunal claim could cost more than a year of consultancy.',
    cta: 'Get My Policy Healthcheck',
    ctaHref: '/tools/policy-healthcheck',
    learnHref: '/policysafe',
    color: 'from-brand-gold/10 to-transparent',
    borderColor: 'border-brand-gold/30',
  },
  {
    tag: 'DealReady People™',
    tagBg: 'bg-brand-navy',
    icon: TrendingUp,
    headline: 'Transforming or acquiring? Don\'t let people kill the deal.',
    body: 'TUPE exposure. Culture clash. Key person risk. DealReady People™ is the pre/post acquisition HR advisory that protects your investment and accelerates integration.',
    pain: 'Your deal team is focused on financials. The people risks are being discovered — after close. That\'s where value leaks.',
    cta: 'Get the Due Diligence Checklist',
    ctaHref: '/tools/due-diligence-checklist',
    learnHref: '/dealready-people',
    color: 'from-brand-navy/10 to-transparent',
    borderColor: 'border-brand-navy/20',
  },
];

export default function FunnelCards() {
  return (
    <section className="section-padding bg-brand-offwhite">
      <div className="container-wide">
        <div className="text-center mb-14">
          <p className="text-brand-teal text-sm font-semibold uppercase tracking-widest mb-3">
            Three systems. One expert.
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-navy mb-4">
            Which challenge fits you right now?
          </h2>
          <p className="text-brand-slate text-lg max-w-2xl mx-auto">
            Most businesses have all three. Start where the pain is loudest.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {funnels.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.tag}
                className={`relative bg-white rounded-2xl border-2 ${f.borderColor} p-8 flex flex-col hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
              >
                {/* Tag */}
                <span className={`funnel-tag text-white text-xs mb-4 self-start ${f.tagBg}`}>
                  {f.tag}
                </span>

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 border ${f.borderColor}`}>
                  <Icon size={24} className="text-brand-navy" />
                </div>

                {/* Headline */}
                <h3 className="font-display text-xl font-bold text-brand-navy mb-3">
                  {f.headline}
                </h3>

                {/* Pain (in italics — mirror their words) */}
                <p className="text-brand-slate/70 text-sm italic border-l-2 border-gray-200 pl-3 mb-4">
                  "{f.pain}"
                </p>

                {/* Body */}
                <p className="text-brand-slate text-sm leading-relaxed mb-6 flex-1">
                  {f.body}
                </p>

                {/* CTAs */}
                <div className="space-y-2">
                  <Link href={f.ctaHref} className="btn-primary w-full justify-center text-sm">
                    {f.cta} <ArrowRight size={15} />
                  </Link>
                  <Link
                    href={f.learnHref}
                    className="flex items-center justify-center gap-1 text-brand-teal text-sm font-medium hover:gap-2 transition-all"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
