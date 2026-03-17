import Link from 'next/link';
import Image from 'next/image';
import { Mail, Linkedin } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

export default function Footer() {
  return (
    <footer style={{ background: 'var(--brand-navy)' }}>
      <style>{`
        .footer-link  { font-size: 0.875rem; color: rgba(255,255,255,0.5); transition: color 0.2s; }
        .footer-link:hover { color: #fff; }
        .footer-icon  {
          width:36px;height:36px;border-radius:8px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6);
          transition:background 0.2s;
        }
        .footer-icon:hover { background:rgba(143,114,246,0.3); }
        .footer-tiny  { font-size:0.75rem;color:rgba(255,255,255,0.28);transition:color 0.2s; }
        .footer-tiny:hover { color:rgba(255,255,255,0.7); }
      `}</style>

      <div className="container-wide section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">

          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center mb-5">
              <Image
                src={LOGO}
                alt="Ravello"
                width={140}
                height={48}
                className="object-contain h-10 w-auto brightness-[1.1]"
              />
            </Link>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
              HR support, structured hiring, and a client portal for growing businesses of 10–250 people.
            </p>
            <div className="flex gap-3">
              <a
                href="https://linkedin.com/company/ravellohr"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-icon"
                aria-label="LinkedIn"
              >
                <Linkedin size={15} />
              </a>
              <a href="mailto:hello@ravellohr.co.uk" className="footer-icon" aria-label="Email">
                <Mail size={15} />
              </a>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-[0.18em] mb-5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Services
            </h4>
            <ul className="space-y-3">
              {[
                ['HR Support',         '/services'],
                ['Hiring Capability',  '/services#hiring'],
                ['Client Portal',      '/how-it-works#portal'],
                ['How It Works',       '/how-it-works'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="footer-link">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-[0.18em] mb-5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Company
            </h4>
            <ul className="space-y-3">
              {[
                ['About',       '/about'],
                ['Contact',     '/contact'],
                ['Privacy',     '/privacy'],
                ['Terms',       '/terms'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="footer-link">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-[0.18em] mb-5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Get Started
            </h4>
            <div
              className="rounded-[16px] p-5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <p className="text-sm font-semibold text-white mb-2">
                Ready to talk?
              </p>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Book a free consultation. We&apos;ll map out what Ravello looks like for your business.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-semibold text-white transition-all"
                style={{
                  background: 'var(--brand-purple)',
                  boxShadow: '0 2px 12px rgba(143,114,246,0.3)',
                }}
              >
                Book a consultation
              </Link>
            </div>
            <div className="mt-4">
              <a href="mailto:hello@ravellohr.co.uk" className="footer-link flex items-center gap-2 text-xs">
                <Mail size={12} /> hello@ravellohr.co.uk
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-14 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            &copy; {new Date().getFullYear()} Ravello. All rights reserved. Registered in England &amp; Wales.
          </p>
          <div className="flex gap-6">
            {[
              ['Privacy Policy', '/privacy'],
              ['Terms of Use', '/terms'],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="footer-tiny">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
