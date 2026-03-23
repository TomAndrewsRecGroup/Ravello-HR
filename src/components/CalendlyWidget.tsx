'use client';
import { useState } from 'react';
import { CalendarCheck, X, ExternalLink } from 'lucide-react';

const CALENDLY_URL = 'https://calendly.com/ravellohr/free-consultation';

export default function CalendlyWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating action */}
      <div className="fixed bottom-6 right-6 z-[150] flex flex-col items-end gap-3">

        {/* Label pill — shows when closed */}
        {!open && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 50%, #3B6FFF 100%)',
              boxShadow: '0 4px 22px rgba(124,58,237,0.45)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            Book a free call
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105"
          style={{
            background: open
              ? 'var(--brand-navy)'
              : 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 50%, #3B6FFF 100%)',
            boxShadow: '0 4px 26px rgba(124,58,237,0.48)',
          }}
          aria-label={open ? 'Close booking' : 'Book a free call'}
        >
          {open ? <X size={22} /> : <CalendarCheck size={22} />}
        </button>
      </div>

      {/* Calendly panel */}
      {open && (
        <div
          className="fixed bottom-28 right-6 z-[149] rounded-[22px] overflow-hidden"
          style={{
            width: '380px',
            height: '560px',
            background: 'var(--bg)',
            boxShadow: '0 24px 64px rgba(7,11,29,0.22), 0 4px 16px rgba(7,11,29,0.10)',
            border: '1px solid var(--brand-line)',
            animation: 'fadeUp 0.25s ease',
            textDecoration: 'none',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 relative"
            style={{
              background: 'var(--brand-navy)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Gradient top line */}
            <div
              className="absolute top-0 left-0 right-0 h-[1.5px]"
              style={{ background: 'var(--gradient)' }}
            />
            <div>
              <p className="text-sm font-semibold text-white">Book a Free 30-Min Call</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
                No pitch. No obligation.
              </p>
            </div>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              Open full page <ExternalLink size={11} />
            </a>
          </div>

          {/* Calendly embed */}
          <iframe
            src={`${CALENDLY_URL}?hide_gdpr_banner=1&hide_event_type_details=0&background_color=eff0f7&text_color=070B1D&primary_color=7C3AED`}
            width="100%"
            height="100%"
            frameBorder="0"
            title="Book a call with Ravello HR"
            style={{ display: 'block', border: 'none' }}
          />
        </div>
      )}
    </>
  );
}
