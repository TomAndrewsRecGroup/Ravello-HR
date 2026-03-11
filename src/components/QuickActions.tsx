'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, MessageSquare, Zap,
  Phone, FileText, ClipboardCheck, BarChart2, X
} from 'lucide-react';

const actions = [
  {
    icon: Phone,
    label: 'Book Free Call',
    sub: '15 mins · No pitch',
    href: '/book',
    type: 'link',
    accent: '#6B21FF',
  },
  {
    icon: Zap,
    label: 'Hiring Score',
    sub: '3 min diagnostic',
    href: '/tools/hiring-score',
    type: 'link',
    accent: '#E040FB',
  },
  {
    icon: BarChart2,
    label: 'HR Risk Score',
    sub: 'Find your gaps',
    href: '/tools/hr-risk-score',
    type: 'link',
    accent: '#4DB8FF',
  },
  {
    icon: ClipboardCheck,
    label: 'Policy Check',
    sub: 'Free healthcheck',
    href: '/tools/policy-healthcheck',
    type: 'link',
    accent: '#E040FB',
  },
  {
    icon: FileText,
    label: 'DD Checklist',
    sub: 'M&A people risk',
    href: '/tools/due-diligence-checklist',
    type: 'link',
    accent: '#4DB8FF',
  },
  {
    icon: MessageSquare,
    label: 'Live Chat',
    sub: 'Talk to us now',
    href: null,
    type: 'chat',
    accent: '#6B21FF',
  },
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);

  const handleChat = () => {
    // Trigger Crisp/Tawk chat if available
    if (typeof window !== 'undefined') {
      // @ts-ignore
      if (window.$crisp) window.$crisp.push(['do', 'chat:open']);
      // @ts-ignore
      else if (window.Tawk_API) window.Tawk_API.toggle();
    }
  };

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-stretch">

      {/* Panel */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: open ? 200 : 0, opacity: open ? 1 : 0 }}
      >
        <div
          className="w-[200px] bg-brand-panel border-l border-y border-brand-violet/30 flex flex-col"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-muted/30">
            <span className="font-mono text-xs text-brand-violet uppercase tracking-widest">// Quick Actions</span>
            <button onClick={() => setOpen(false)} className="text-brand-slate hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Actions list */}
          <div className="flex flex-col py-2">
            {actions.map((action) => {
              const Icon = action.icon;
              const inner = (
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-brand-violet/10 transition-colors group cursor-pointer">
                  <div className="w-7 h-7 flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${action.accent}22`,
                      border: `1px solid ${action.accent}44`,
                      clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))',
                    }}
                  >
                    <Icon size={13} style={{ color: action.accent }} />
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold leading-none mb-0.5">{action.label}</p>
                    <p className="text-white/30 text-[10px]">{action.sub}</p>
                  </div>
                </div>
              );

              return action.type === 'chat' ? (
                <button key={action.label} onClick={handleChat} className="w-full text-left">
                  {inner}
                </button>
              ) : (
                <Link key={action.label} href={action.href!}>
                  {inner}
                </Link>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-auto px-4 py-3 border-t border-brand-muted/30">
            <p className="font-mono text-[9px] text-brand-slate/50 uppercase tracking-widest">ravellohr.co.uk</p>
          </div>
        </div>
      </div>

      {/* Toggle tab */}
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center justify-center gap-1 w-7 transition-all"
        style={{
          background: open
            ? 'linear-gradient(180deg, #6B21FF, #E040FB)'
            : 'linear-gradient(180deg, rgba(107,33,255,0.8), rgba(224,64,251,0.8))',
          clipPath: 'polygon(0 0, 100% 4px, 100% calc(100% - 4px), 0 100%)',
          boxShadow: open ? '0 0 20px rgba(107,33,255,0.5)' : '0 0 10px rgba(107,33,255,0.3)',
          minHeight: 160,
        }}
        aria-label={open ? 'Close quick actions' : 'Open quick actions'}
      >
        {open
          ? <ChevronRight size={14} className="text-white" />
          : <>
              <ChevronLeft size={14} className="text-white" />
              {['Q','A'].map((l) => (
                <span key={l} className="text-white font-mono font-bold text-[10px] leading-none">{l}</span>
              ))}
            </>
        }
      </button>

    </div>
  );
}
