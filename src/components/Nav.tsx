'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';

const solutions = [
  { href: '/smart-hiring-system', label: 'Smart Hiring System™', tag: 'A', color: 'text-brand-violet' },
  { href: '/policysafe',          label: 'PolicySafe™',           tag: 'B', color: 'text-brand-pink' },
  { href: '/dealready-people',    label: 'DealReady People™',     tag: 'C', color: 'text-brand-cyan' },
];

const tools = [
  { href: '/tools/hiring-score',           label: 'Smart Hiring Score' },
  { href: '/tools/hr-risk-score',          label: 'HR Risk & Compliance Score' },
  { href: '/tools/policy-healthcheck',     label: 'Policy Healthcheck' },
  { href: '/tools/due-diligence-checklist',label: 'Due Diligence Checklist' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-brand-void/95 backdrop-blur-md border-b border-brand-violet/20'
          : 'bg-transparent'
      }`}
    >
      {/* Top accent line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #6B21FF, #E040FB, transparent)' }} />

      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9">
              <Image src="/logo-icon.png" alt="Ravello HR" fill className="object-contain" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display font-bold text-xl tracking-widest text-white group-hover:text-gradient transition-all">
                RAVELLO
                <span className="text-brand-pink ml-1">HR</span>
              </span>
              <span className="text-[9px] tracking-[0.25em] text-brand-slate font-mono uppercase">HIRE · LEAD · PROTECT</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">

            <div
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button className="flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white transition-colors">
                Solutions <ChevronDown size={14} className={`transition-transform ${solutionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {solutionsOpen && (
                <div className="absolute top-full left-0 mt-3 w-68 bg-brand-panel border border-brand-violet/30 p-2"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
                >
                  {solutions.map((s) => (
                    <Link key={s.href} href={s.href}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-violet/10 group transition-colors"
                    >
                      <span className={`font-mono text-xs font-bold ${s.color}`}>[{s.tag}]</span>
                      <span className="text-sm text-white/80 group-hover:text-white">{s.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div
              className="relative"
              onMouseEnter={() => setToolsOpen(true)}
              onMouseLeave={() => setToolsOpen(false)}
            >
              <button className="flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white transition-colors">
                Free Tools <ChevronDown size={14} className={`transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolsOpen && (
                <div className="absolute top-full left-0 mt-3 w-64 bg-brand-panel border border-brand-violet/30 p-2"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
                >
                  {tools.map((t) => (
                    <Link key={t.href} href={t.href}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-brand-violet/10 text-sm text-white/80 hover:text-white transition-colors group"
                    >
                      <span className="w-1 h-1 rounded-full bg-brand-violet group-hover:bg-brand-pink transition-colors" />
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/playbook" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
              Playbook
            </Link>
            <Link href="/about" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
              About
            </Link>
            <Link href="/book" className="btn-primary text-sm py-2 px-5">
              Book Free Call
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden p-2 text-white"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="lg:hidden bg-brand-panel border border-brand-violet/30 pb-4 mb-2"
            style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
          >
            <div className="px-4 pt-4 space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-brand-violet px-2 pb-1">// Solutions</p>
              {solutions.map((s) => (
                <Link key={s.href} href={s.href}
                  className="block px-3 py-2.5 text-white/80 hover:text-white hover:bg-brand-violet/10 text-sm transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {s.label}
                </Link>
              ))}
              <p className="text-[10px] font-mono uppercase tracking-widest text-brand-violet px-2 pt-3 pb-1">// Free Tools</p>
              {tools.map((t) => (
                <Link key={t.href} href={t.href}
                  className="block px-3 py-2.5 text-white/80 hover:text-white hover:bg-brand-violet/10 text-sm transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {t.label}
                </Link>
              ))}
              <div className="pt-3 px-2">
                <Link href="/book" className="btn-primary w-full justify-center text-sm" onClick={() => setOpen(false)}>
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
