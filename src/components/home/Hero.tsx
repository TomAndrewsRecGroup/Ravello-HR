'use client';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Hero() {
  return (
    <section className="relative gradient-hero min-h-screen flex items-center overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Gradient orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-teal/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 bg-brand-teal rounded-full animate-pulse" />
              <span className="text-white/90 text-sm font-medium">Strategic HR for Ambitious Businesses</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Your hiring is
              <span className="block text-brand-teal">costing more</span>
              than you know.
            </h1>

            <p className="text-white/80 text-lg lg:text-xl leading-relaxed mb-8 max-w-lg">
              Reopened roles. Agency dependency. Policy gaps waiting to blow up.
              Ravello HR finds the leak — and fixes it — with a named system, not generic advice.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link href="/tools/hiring-score" className="btn-gold text-base">
                Get Your Free Hiring Score <ArrowRight size={18} />
              </Link>
              <Link href="/tools/hr-risk-score" className="btn-outline border-white/40 text-white hover:bg-white hover:text-brand-navy text-base">
                Check Your HR Risk Score
              </Link>
            </div>

            {/* Micro social proof */}
            <div className="flex items-center gap-6">
              <div className="flex -space-x-2">
                {['A','B','C','D'].map((l) => (
                  <div key={l} className="w-8 h-8 rounded-full bg-brand-teal/80 border-2 border-white/30 flex items-center justify-center text-white text-xs font-bold">{l}</div>
                ))}
              </div>
              <p className="text-white/70 text-sm">
                <span className="text-white font-semibold">50+ leaders</span> have already scored their hiring
              </p>
            </div>
          </motion.div>

          {/* Right: "What\'s leaking" card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8">
              <p className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-6">Common Hiring Leaks We Fix</p>
              <ul className="space-y-4">
                {[
                  { icon: '🔁', text: 'Roles reopened within 6 months', stat: '34% avg cost' },
                  { icon: '💸', text: 'Agency spend with no ROI framework', stat: '\u00a312–18k per hire' },
                  { icon: '📋', text: 'No consistent interview scorecard', stat: '2x drop-off' },
                  { icon: '⚡', text: 'Slow decisions losing top candidates', stat: '5-day window' },
                  { icon: '📁', text: 'Missing or out-of-date HR policies', stat: '\u00a310k+ fine risk' },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{item.text}</p>
                    </div>
                    <span className="text-brand-gold text-xs font-semibold bg-brand-gold/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {item.stat}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/tools/hiring-score" className="mt-6 btn-gold w-full justify-center text-sm">
                Find Your Leaks Free <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
        <p className="text-white/40 text-xs">Scroll to explore</p>
        <ChevronDown className="text-white/40" size={20} />
      </div>
    </section>
  );
}
