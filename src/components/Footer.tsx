import Link from 'next/link';
import { Mail, Phone, Linkedin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-brand-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <span className="font-display font-bold text-lg">Ravello HR</span>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              Strategic HR systems for ambitious businesses. We strip away the unnecessary and give leaders confidence to make great people decisions.
            </p>
            <div className="flex gap-3 mt-6">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-brand-teal transition-colors"
              >
                <Linkedin size={16} />
              </a>
              <a
                href="mailto:hello@ravellohr.co.uk"
                className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-brand-teal transition-colors"
              >
                <Mail size={16} />
              </a>
            </div>
          </div>

          {/* Solutions */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-widest mb-4 text-white/50">Solutions</h4>
            <ul className="space-y-2.5">
              {[
                ['Smart Hiring System™', '/smart-hiring-system'],
                ['PolicySafe™', '/policysafe'],
                ['DealReady People™', '/dealready-people'],
                ['Training & Development', '/smart-hiring-system#training'],
                ['Change Management', '/dealready-people#change'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-brand-teal text-sm transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Free Tools */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-widest mb-4 text-white/50">Free Tools</h4>
            <ul className="space-y-2.5">
              {[
                ['Smart Hiring Score', '/tools/hiring-score'],
                ['HR Risk Score', '/tools/hr-risk-score'],
                ['Policy Healthcheck', '/tools/policy-healthcheck'],
                ['Due Diligence Checklist', '/tools/due-diligence-checklist'],
                ['People Ops Playbook', '/playbook'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-brand-teal text-sm transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-widest mb-4 text-white/50">Get Started</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/book"
                  className="flex items-center gap-2 text-white/70 hover:text-brand-teal text-sm transition-colors"
                >
                  <Phone size={14} /> Book a Free 15-Min Call
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@ravellohr.co.uk"
                  className="flex items-center gap-2 text-white/70 hover:text-brand-teal text-sm transition-colors"
                >
                  <Mail size={14} /> hello@ravellohr.co.uk
                </a>
              </li>
            </ul>
            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-xs text-white/60 mb-2">No-Fluff HR Hotline</p>
              <p className="text-sm font-medium text-white">Book 15 mins. Bring your mess. Leave with clarity.</p>
              <Link href="/book" className="btn-primary mt-3 text-sm py-2 px-4">
                Book Now
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-xs">
            &copy; {new Date().getFullYear()} Ravello HR. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[['Privacy Policy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
              <Link key={href} href={href} className="text-white/40 hover:text-white/70 text-xs transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
