import Link from 'next/link';
import { Phone, Clock, Zap } from 'lucide-react';

export default function HotlineSection() {
  return (
    <section className="py-16 bg-brand-teal">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-4 py-1.5 mb-6">
          <Zap size={14} className="text-white" />
          <span className="text-white text-sm font-semibold">No-Fluff HR Hotline</span>
        </div>

        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
          Book 15 mins. Bring your mess. Leave with clarity.
        </h2>
        <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
          Not a sales call. Not a proposal. Just Lucinda, your specific challenge, and a clear next step.
          No commitment required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link href="/book" className="bg-white text-brand-teal font-bold px-8 py-4 rounded-lg hover:bg-brand-offwhite transition-colors inline-flex items-center gap-2 text-lg">
            <Phone size={20} /> Book Your 15-Min Call
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-8">
          {[
            { icon: Clock, text: '15 minutes, no fluff' },
            { icon: Zap, text: 'You leave with clarity' },
            { icon: Phone, text: 'Zero commitment' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-white/80">
              <Icon size={16} />
              <span className="text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
