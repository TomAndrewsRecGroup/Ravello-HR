'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';

const solutions = [
  { href: '/smart-hiring-system', label: 'Smart Hiring System™', sub: 'Fix hiring drift' },
  { href: '/policysafe',          label: 'PolicySafe™',           sub: 'Compliance & docs' },
  { href: '/dealready-people',    label: 'DealReady People™',     sub: 'M&A & restructure' },
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
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white/95 backdrop-blur-sm shadow-[0_1px_0_rgba(20,27,52,0.08)]' : 'bg-transparent'
    }`}>
      <nav className="container-wide px-6 lg:px-10">
        <div className="flex items-center justify-between h-[70px]">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9">
              <Image src="/logo-icon.png" alt="Ravello HR" fill className="object-contain" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display font-bold text-[17px] tracking-tight" style={{ color: 'var(--ink)' }}>
                RAVELLO <span className="text-gradient">HR</span>
              </span>
              <span className="text-[9px] tracking-[0.2em] font-medium uppercase" style={{ color: 'var(--ink-faint)' }}>
                HIRE · LEAD · PROTECT
              </span>
            </div>
          </Link>

          {/* Desktop */}
          <div className="hidden lg:flex items-center gap-1">
            <div className="relative" onMouseEnter={() => setSolutions(true)} onMouseLeave={() => setSolutions(false)}>
              <button className="btn-ghost flex items-center gap-1.5">
                Solutions <ChevronDown size={14} className={`transition-transform duration-200 ${solutionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {solutionsOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-[16px] p-2 shadow-[0_8px_40px_rgba(14,22,51,0.14)] border border-[var(--brand-line)]">
                  {solutions.map((s) => (
                    <Link key={s.href} href={s.href}
                      className="flex flex-col px-4 py-3 rounded-xl hover:bg-[var(--surface-alt)] transition-colors group">
                      <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</span>
                      <span className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.sub}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" onMouseEnter={() => setTools(true)} onMouseLeave={() => setTools(false)}>
              <button className="btn-ghost flex items-center gap-1.5">
                Free Tools <ChevronDown size={14} className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolsOpen && (
                <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-[16px] p-2 shadow-[0_8px_40px_rgba(14,22,51,0.14)] border border-[var(--brand-line)]">
                  {tools.map((t) => (
                    <Link key={t.href} href={t.href}
                      className="block px-4 py-3 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/playbook" className="btn-ghost">Playbook</Link>
            <Link href="/about"    className="btn-ghost">About</Link>

            <div className="w-px h-5 mx-2" style={{ background: 'var(--brand-line)' }} />
            <Link href="/book" className="btn-primary">Book Free Call</Link>
          </div>

          <button className="lg:hidden p-2" style={{ color: 'var(--ink)' }} onClick={() => setOpen(!open)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile */}
        {open && (
          <div className="lg:hidden bg-white rounded-[20px] border border-[var(--brand-line)] shadow-[0_8px_40px_rgba(14,22,51,0.12)] p-5 mb-4">
            <div className="space-y-1">
              {[...solutions, ...tools].map((item) => (
                <Link key={item.href} href={item.href}
                  className="block px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors"
                  style={{ color: 'var(--ink-soft)' }}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-3">
                <Link href="/book" className="btn-primary w-full justify-center" onClick={() => setOpen(false)}>
                  Book Free Call
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
