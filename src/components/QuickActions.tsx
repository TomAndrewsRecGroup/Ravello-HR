'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, MessageSquare, Zap,
  Phone, FileText, ClipboardCheck, BarChart2, X,
} from 'lucide-react';

const actions = [
  { icon: Phone,          label: 'Book Free Call',  sub: '15 mins · No pitch',   href: '/book',                           type: 'link'  },
  { icon: Zap,            label: 'Hiring Score',     sub: '3 min diagnostic',     href: '/tools/hiring-score',             type: 'link'  },
  { icon: BarChart2,      label: 'HR Risk Score',    sub: 'Find your gaps',       href: '/tools/hr-risk-score',            type: 'link'  },
  { icon: ClipboardCheck, label: 'Policy Check',     sub: 'Free healthcheck',     href: '/tools/policy-healthcheck',       type: 'link'  },
  { icon: FileText,       label: 'DD Checklist',     sub: 'M&A people risk',      href: '/tools/due-diligence-checklist',  type: 'link'  },
  { icon: MessageSquare,  label: 'Live Chat',         sub: 'Talk to us now',       href: null,                              type: 'chat'  },
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);

  const handleChat = () => {
    if (typeof window === 'undefined') return;
    // @ts-ignore
    if (window.$crisp)     window.$crisp.push(['do', 'chat:open']);
    // @ts-ignore
    else if (window.Tawk_API) window.Tawk_API.toggle();
  };

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-stretch">

      {/* Slide-out panel */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: open ? 224 : 0, opacity: open ? 1 : 0 }}
      >
        <div
          className="w-[224px] rounded-l-[18px] flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--brand-line)',
            borderRight: 'none',
            boxShadow: '-4px 0 36px rgba(7,11,29,0.10)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: '1px solid var(--brand-line)' }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-[0.20em]"
              style={{ color: 'var(--brand-purple)' }}
            >
              Quick Actions
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-[var(--surface-alt)] transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex-1 py-2">
            {actions.map((a) => {
              const Icon = a.icon;
              const inner = (
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-alt)] transition-colors cursor-pointer group">
                  <div
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'rgba(124,58,237,0.07)',
                      border: '1px solid rgba(124,58,237,0.14)',
                    }}
                  >
                    <Icon size={14} style={{ color: 'var(--brand-purple)' }} />
                  </div>
                  <div>
                    <p
                      className="text-[12px] font-semibold leading-none mb-0.5"
                      style={{ color: 'var(--ink)' }}
                    >
                      {a.label}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                      {a.sub}
                    </p>
                  </div>
                </div>
              );
              return a.type === 'chat'
                ? <button key={a.label} onClick={handleChat} className="w-full text-left">{inner}</button>
                : <Link key={a.label} href={a.href!}>{inner}</Link>;
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--brand-line)' }}>
            <p className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
              thepeoplesystem.co.uk
            </p>
          </div>
        </div>
      </div>

      {/* Toggle tab — compact vertical gradient pill */}
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center justify-center gap-1.5 transition-all duration-200"
        style={{
          width: 36,
          height: 96,
          background: 'linear-gradient(180deg, #7C3AED 0%, #3B6FFF 100%)',
          borderRadius: '10px 0 0 10px',
          boxShadow: '-3px 0 20px rgba(124,58,237,0.28)',
        }}
        aria-label={open ? 'Close quick actions' : 'Open quick actions'}
      >
        {!open && <ChevronLeft size={14} className="text-white/80" />}
        {open  && <ChevronRight size={14} className="text-white/80" />}
        <span
          className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/70"
          style={{ writingMode: 'vertical-rl' }}
        >
          {open ? 'Close' : 'Menu'}
        </span>
      </button>
    </div>
  );
}
