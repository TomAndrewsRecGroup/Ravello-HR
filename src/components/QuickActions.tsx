'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MessageSquare, Zap, Phone, FileText, ClipboardCheck, BarChart2, X } from 'lucide-react';

const actions = [
  { icon: Phone,         label: 'Book Free Call',  sub: '15 mins · No pitch',   href: '/book',                           type: 'link'  },
  { icon: Zap,           label: 'Hiring Score',     sub: '3 min diagnostic',     href: '/tools/hiring-score',             type: 'link'  },
  { icon: BarChart2,     label: 'HR Risk Score',    sub: 'Find your gaps',       href: '/tools/hr-risk-score',            type: 'link'  },
  { icon: ClipboardCheck,label: 'Policy Check',     sub: 'Free healthcheck',     href: '/tools/policy-healthcheck',       type: 'link'  },
  { icon: FileText,      label: 'DD Checklist',     sub: 'M&A people risk',      href: '/tools/due-diligence-checklist',  type: 'link'  },
  { icon: MessageSquare, label: 'Live Chat',         sub: 'Talk to us now',       href: null,                              type: 'chat'  },
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);

  const handleChat = () => {
    if (typeof window === 'undefined') return;
    // @ts-ignore
    if (window.$crisp)    window.$crisp.push(['do', 'chat:open']);
    // @ts-ignore
    else if (window.Tawk_API) window.Tawk_API.toggle();
  };

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-stretch">

      {/* Slide-out panel */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: open ? 220 : 0, opacity: open ? 1 : 0 }}
      >
        <div className="w-[220px] bg-white border-l border-y rounded-l-[16px] flex flex-col"
          style={{ borderColor: 'var(--brand-line)', boxShadow: '-4px 0 32px rgba(14,22,51,0.1)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--brand-line)' }}>
            <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--brand-purple)' }}>Quick Actions</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-[var(--surface-alt)] transition-colors"
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
                  <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--surface-alt)', border: '1px solid var(--brand-line)' }}
                  >
                    <Icon size={14} style={{ color: 'var(--brand-purple)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold leading-none mb-0.5" style={{ color: 'var(--ink)' }}>{a.label}</p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{a.sub}</p>
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
            <p className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>ravellohr.co.uk</p>
          </div>
        </div>
      </div>

      {/* Toggle tab */}
      <button
        onClick={() => setOpen(!open)}
        className="w-8 flex flex-col items-center justify-center gap-1 transition-all duration-200"
        style={{
          minHeight: 140,
          background: open ? 'var(--brand-navy)' : 'var(--brand-navy)',
          borderRadius: '8px 0 0 8px',
          boxShadow: '-2px 0 16px rgba(14,22,51,0.15)',
          writingMode: 'vertical-rl',
        }}
        aria-label={open ? 'Close quick actions' : 'Open quick actions'}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70" style={{ writingMode: 'vertical-rl', letterSpacing: '0.15em' }}>
          {open ? '✕' : 'Quick'}
        </span>
        {!open && <ChevronLeft size={12} className="text-white/60" />}
        {open  && <ChevronRight size={12} className="text-white/60" />}
      </button>
    </div>
  );
}
