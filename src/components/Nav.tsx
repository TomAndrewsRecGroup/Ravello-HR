'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown, CalendarCheck } from 'lucide-react';

// Same logo mark as hero — tripled size
const LOGO_MARK = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

const solutions = [
  { href: '/smart-hiring-system', label: 'Smart Hiring System™', sub: 'Fix hiring drift',   dot: 'var(--brand-purple)' },
  { href: '/policysafe',          label: 'PolicySafe™',           sub: 'Compliance & docs', dot: 'var(--brand-blue)' },
  { href: '/dealready-people',    label: 'DealReady People™',     sub: 'M&A & restructure', dot: 'var(--brand-pink)' },
];
const tools = [
  { href: '/tools/hiring-score',            label: 'Smart Hiring Score' },
  { href: '/tools/hr-risk-score',           label: 'HR Risk Score' },
  { href: '/tools/policy-healthcheck',      label: 'Policy Healthcheck' },
  { href: '/tools/due-diligence-checklist', label: 'DD Checklist' },
];

export default function Nav() {
  const [open, setOpen]         = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [solOpen, setSol]       = useState(false);
  const [toolOpen, setTool]     = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const navTextColor = scrolled ? 'var(--ink-soft)' : 'rgba(255,255,255,0.82)';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/96 backdrop-blur-lg shadow-[0_1px_0_rgba(13,21,53,0.08)]'
          : 'bg-transparent'
      }`}
    >
      <nav className="container-wide px-6 lg:px-10">
        <div className="flex items-center justify-between h-[88px]">

          {/* Logo — brand mark, triple the previous size */}
          <Link href="/" className="flex items-center flex-shrink-0">
            <Image
              src={LOGO_MARK}
              alt="Ravello HR"
              width={360}
              height={120}
              className="h-[72px] w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">

            {/* Solutions */}
            <div className="relative" onMouseEnter={() => setSol(true)} onMouseLeave={() => setSol(false)}>
              <button className="btn-ghost flex items-center gap-1.5" style={{ color: navTextColor }}>
                Solutions
                <ChevronDown size={13} className={`transition-transform duration-200 ${solOpen ? 'rotate-180' : ''}`} />
              </button>
              {solOpen && (
                <div
                  className="absolute top-full left-0 mt-1.5 bg-white rounded-[18px] p-2"
                  style={{ minWidth: '268px', boxShadow: '0 8px 40px rgba(13,21,53,0.13)', border: '1px solid var(--brand-line)', animation: 'slideDown 0.16s ease forwards' }}
                >
                  {solutions.map((s) => (
                    <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3 rounded-[12px] transition-colors hover:bg-[var(--surface-alt)] group">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                      <div>
                        <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.sub}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Tools */}
            <div className="relative" onMouseEnter={() => setTool(true)} onMouseLeave={() => setTool(false)}>
              <button className="btn-ghost flex items-center gap-1.5" style={{ color: navTextColor }}>
                Free Tools
                <ChevronDown size={13} className={`transition-transform duration-200 ${toolOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolOpen && (
                <div
                  className="absolute top-full left-0 mt-1.5 bg-white rounded-[18px] p-2"
                  style={{ minWidth: '224px', boxShadow: '0 8px 40px rgba(13,21,53,0.13)', border: '1px solid var(--brand-line)', animation: 'slideDown 0.16s ease forwards' }}
                >
                  {tools.map((t) => (
                    <Link key={t.href} href={t.href} className="block px-4 py-3 rounded-[12px] text-sm font-medium transition-colors hover:bg-[var(--surface-alt)]" style={{ color: 'var(--ink-soft)' }}>
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/playbook" className="btn-ghost" style={{ color: navTextColor }}>Playbook</Link>
            <Link href="/about"    className="btn-ghost" style={{ color: navTextColor }}>About</Link>

            <div className="w-px h-5 mx-3" style={{ background: scrolled ? 'var(--brand-line)' : 'rgba(255,255,255,0.18)' }} />

            <Link href="/book" className="btn-gradient">
              <CalendarCheck size={15} /> Book Free Call
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden p-2 rounded-xl transition-colors"
            style={{ color: scrolled ? 'var(--ink)' : 'rgba(255,255,255,0.9)' }}
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div
            className="lg:hidden bg-white rounded-[22px] p-5 mb-4"
            style={{ border: '1px solid var(--brand-line)', boxShadow: '0 10px 40px rgba(13,21,53,0.13)', animation: 'slideDown 0.2s ease forwards' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--ink-faint)' }}>Solutions</p>
            {solutions.map((s) => (
              <Link key={s.href} href={s.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                <span className="font-medium">{s.label}</span>
              </Link>
            ))}
            <div className="my-3 brand-divider" />
            <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--ink-faint)' }}>Free Tools</p>
            {tools.map((t) => (
              <Link key={t.href} href={t.href} className="block px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>
                {t.label}
              </Link>
            ))}
            <div className="my-3 brand-divider" />
            <Link href="/playbook" className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>Playbook</Link>
            <Link href="/about"    className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>About</Link>
            <div className="pt-4">
              <Link href="/book" className="btn-gradient w-full" onClick={() => setOpen(false)}>
                <CalendarCheck size={15} /> Book Free Call
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
