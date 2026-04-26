'use client';

import Link from 'next/link';

// Floating Book-a-Call affordance, anchored bottom-right on every page
// of the marketing site. Routes the user to /book where the booking
// form lives.
export default function BookCallButton() {
  return (
    <Link
      href="/book"
      className="fixed bottom-6 right-6 z-[150] inline-flex items-center px-5 py-3 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:scale-105"
      style={{
        background: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 50%, #3B6FFF 100%)',
        boxShadow: '0 4px 26px rgba(124,58,237,0.48)',
      }}
      aria-label="Book a Call"
    >
      Book a Call
    </Link>
  );
}
