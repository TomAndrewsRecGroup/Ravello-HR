'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown, CalendarCheck } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

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
  const [open, setOpen]               = useState(false);
  const [scrolled, setScrolled]       = useState(false);
  const [solutionsOpen, setSolutions] = useState(false);
  const [toolsOpen, setTools]         = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-[0_1px_0_rgba(20,27,52,0.08)]'
          : 'bg-transparent'
      }`}
    >
      <nav className="container-wide px-6 lg:px-10">
        <div className="flex items-center justify-between h-[72px]">

          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src={LOGO}
              alt="Ravello HR"
              width={160}
              height={48}
              className="h-10 w-auto object-contain transition-opacity duration-200 hover:opacity-85"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">

            {/* Solutions dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setSolutions(true)}
              onMouseLeave={() => setSolutions(false)}
            >
              <button
                className="btn-ghost flex items-center gap-1.5"
                style={{ color: scrolled ? 'var(--ink-soft)' : 'rgba(255,255,255,0.75)' }}
              >
                Solutions
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${solutionsOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {solutionsOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-68 bg-white rounded-[18px] p-2"
                  style={{
                    boxShadow: '0 8px 40px rgba(14,22,51,0.14)',
                    border: '1px solid var(--brand-line)',
                    animation: 'slideDown 0.18s ease forwards',
                    minWidth: '260px',
                  }}
                >
                  {solutions.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="flex items-center gap-3 px-4 py-3 rounded-[12px] transition-colors hover:bg-[var(--surface-alt)]"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: s.dot }}
                      />
                      <div>
                        <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.sub}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Tools dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setTools(true)}
              onMouseLeave={() => setTools(false)}
            >
              <button
                className="btn-ghost flex items-center gap-1.5"
                style={{ color: scrolled ? 'var(--ink-soft)' : 'rgba(255,255,255,0.75)' }}
              >
                Free Tools
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {toolsOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-56 bg-white rounded-[18px] p-2"
                  style={{
                    boxShadow: '0 8px 40px rgba(14,22,51,0.14)',
                    border: '1px solid var(--brand-line)',
                    animation: 'slideDown 0.18s ease forwards',
                  }}
                >
                  {tools.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="block px-4 py-3 rounded-[12px] text-sm transition-colors hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/playbook"
              className="btn-ghost"
              style={{ color: scrolled ? 'var(--ink-soft)' : 'rgba(255,255,255,0.75)' }}
            >
              Playbook
            </Link>
            <Link
              href="/about"
              className="btn-ghost"
              style={{ color: scrolled ? 'var(--ink-soft)' : 'rgba(255,255,255,0.75)' }}
            >
              About
            </Link>

            <div className="w-px h-5 mx-2" style={{ background: scrolled ? 'var(--brand-line)' : 'rgba(255,255,255,0.15)' }} />

            <Link href="/book" className="btn-gradient">
              <CalendarCheck size={15} />
              Book Free Call
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-lg transition-colors"
            style={{ color: scrolled ? 'var(--ink)' : 'rgba(255,255,255,0.85)' }}
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div
            className="lg:hidden bg-white rounded-[20px] p-5 mb-4"
            style={{
              border: '1px solid var(--brand-line)',
              boxShadow: '0 8px 40px rgba(14,22,51,0.14)',
              animation: 'slideDown 0.2s ease forwards',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--ink-faint)' }}>Solutions</p>
            {solutions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-[var(--surface-alt)]"
                style={{ color: 'var(--ink-soft)' }}
                onClick={() => setOpen(false)}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: item.dot }} />
                {item.label}
              </Link>
            ))}

            <div className="my-3" style={{ borderTop: '1px solid var(--brand-line)' }} />

            <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--ink-faint)' }}>Free Tools</p>
            {tools.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-[var(--surface-alt)]"
                style={{ color: 'var(--ink-soft)' }}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <div className="my-3" style={{ borderTop: '1px solid var(--brand-line)' }} />

            <Link href="/playbook" className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>Playbook</Link>
            <Link href="/about"    className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>About</Link>

            <div className="pt-4">
              <Link href="/book" className="btn-gradient w-full justify-center" onClick={() => setOpen(false)}>
                <CalendarCheck size={15} />
                Book Free Call
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
