'use client';
import { useState } from 'react';
import { CalendarCheck, X, ExternalLink } from 'lucide-react';

// Replace with your actual Calendly URL
const CALENDLY_URL = 'https://calendly.com/ravellohr/free-consultation';

export default function CalendlyWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-[150] flex flex-col items-end gap-3">
        {/* Tooltip label — shows when not open */}
        {!open && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg"
            style={{
              background: 'var(--gradient-hero)',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 20px rgba(124,92,246,0.4)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Book a free call
          </div>
        )}

        {/* Main FAB */}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl transition-all duration-200 hover:scale-105"
          style={{
            background: open ? 'var(--brand-navy)' : 'linear-gradient(135deg, #7C5CF6 0%, #5B9BFF 100%)',
            boxShadow: '0 4px 24px rgba(124,92,246,0.45)',
          }}
          aria-label={open ? 'Close booking' : 'Book a free call'}
        >
          {open ? <X size={22} /> : <CalendarCheck size={22} />}
        </button>
      </div>

      {/* Calendly panel */}
      {open && (
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-28 right-6 z-[149] rounded-[24px] overflow-hidden flex flex-col items-center justify-center"
          style={{
            width: '380px',
            height: '560px',
            background: 'var(--bg)',
            boxShadow: '0 20px 60px rgba(13,21,53,0.22)',
            border: '1px solid var(--brand-line)',
            animation: 'fadeUp 0.25s ease',
            textDecoration: 'none',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between w-full px-5 py-4"
            style={{ background: 'var(--brand-navy)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div>
              <p className="text-sm font-semibold text-white">Book a Free 30-Min Call</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>No pitch. No obligation.</p>
            </div>
            <ExternalLink size={16} style={{ color: 'rgba(255,255,255,0.45)' }} />
          </div>

          {/* CTA state */}
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <CalendarCheck size={48} style={{ color: 'var(--brand-purple)', marginBottom: '16px' }} />
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Open Calendly in a new window</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Find a time that works for you</p>
          </div>
        </a>
      )}
    </>
  );
}
