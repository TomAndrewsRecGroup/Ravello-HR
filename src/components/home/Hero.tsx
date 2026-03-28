'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, type ElementType } from 'react';
import { CalendarCheck, ArrowRight, Briefcase, Users, ShieldCheck, Network } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const STATS = [
  { val: '18+', lab: 'Years HR leadership', gold: true },
  { val: '10+', lab: 'Years in Talent',     gold: false },
  { val: '0',   lab: 'Tribunal outcomes',   gold: true },
];

const BARS = [
  { label: 'Location',      val: 78, color: '#D94444' },
  { label: 'Salary',        val: 62, color: '#E8954A' },
  { label: 'Skills',        val: 45, color: '#E8B84A' },
  { label: 'Working Model', val: 80, color: '#D94444' },
  { label: 'Process',       val: 22, color: '#5A9E6F' },
];

type CardDef = {
  id: string;
  label: string;
  Icon: ElementType;
  title: string;
  desc: string;
  href: string;
  large: boolean;
  accentColor: string;
  accentBg: string;
  shadowColor: string;
};

const CARDS: CardDef[] = [
  {
    id: 'people',
    label: 'PEOPLE',
    Icon: Network,
    title: 'Strategic HR Advisory',
    desc: 'Empowering senior leaders to transform, mature, and grow their HR, Talent, and People function for strategic business success.',
    href: '/why-ravello',
    large: true,
    accentColor: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.09)',
    shadowColor: 'rgba(124,58,237,0.22)',
  },
  {
    id: 'hire',
    label: 'HIRE',
    Icon: Briefcase,
    title: 'Talent Acquisition',
    desc: 'Right people, faster. Friction-scored roles, full pipeline visibility, no wasted agency spend.',
    href: '/hire',
    large: false,
    accentColor: '#3B6FFF',
    accentBg: 'rgba(59,111,255,0.09)',
    shadowColor: 'rgba(59,111,255,0.20)',
  },
  {
    id: 'lead',
    label: 'LEAD',
    Icon: Users,
    title: 'People Leadership',
    desc: 'Training, performance reviews, and skills matrix. Develop your people with real structure.',
    href: '/lead',
    large: false,
    accentColor: '#EA3DC4',
    accentBg: 'rgba(234,61,196,0.09)',
    shadowColor: 'rgba(234,61,196,0.20)',
  },
  {
    id: 'protect',
    label: 'PROTECT',
    Icon: ShieldCheck,
    title: 'HR Protection',
    desc: 'Compliance, employee documents, absence tracking. Stay protected and ahead of every risk.',
    href: '/protect',
    large: false,
    accentColor: '#14B8A6',
    accentBg: 'rgba(20,184,166,0.09)',
    shadowColor: 'rgba(20,184,166,0.20)',
  },
];

function PeopleGraphic({ color }: { color: string }) {
  return (
    <svg width="130" height="100" viewBox="0 0 130 100" fill="none" aria-hidden="true">
      {/* Central node */}
      <circle cx="65" cy="32" r="14" fill={`${color}18`} stroke={color} strokeWidth="2" />
      <circle cx="65" cy="32" r="6" fill={color} opacity="0.7" />
      {/* Bottom left node */}
      <circle cx="22" cy="80" r="10" fill={`${color}14`} stroke={color} strokeWidth="1.5" />
      <circle cx="22" cy="80" r="4" fill={color} opacity="0.5" />
      {/* Bottom right node */}
      <circle cx="108" cy="80" r="10" fill={`${color}14`} stroke={color} strokeWidth="1.5" />
      <circle cx="108" cy="80" r="4" fill={color} opacity="0.5" />
      {/* Middle node */}
      <circle cx="65" cy="68" r="8" fill={`${color}12`} stroke={color} strokeWidth="1.5" />
      <circle cx="65" cy="68" r="3" fill={color} opacity="0.6" />
      {/* Connecting lines */}
      <line x1="65" y1="46" x2="22" y2="70" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="65" y1="46" x2="108" y2="70" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="65" y1="46" x2="65" y2="60" stroke={color} strokeWidth="1" opacity="0.3" />
      {/* Floating dots */}
      <circle cx="42" cy="50" r="3" fill={color} opacity="0.25" />
      <circle cx="90" cy="48" r="2.5" fill={color} opacity="0.20" />
    </svg>
  );
}

function HeroCard({ card }: { card: CardDef }) {
  const [hovered, setHovered] = useState(false);
  const { Icon } = card;

  return (
    <Link
      href={card.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: hovered ? `${card.accentBg}` : 'var(--surface)',
        border: `1.5px solid ${hovered ? card.accentColor : 'var(--brand-line)'}`,
        borderRadius: 22,
        padding: card.large ? '26px 22px 22px' : '18px 16px 16px',
        height: card.large ? 380 : 238,
        width: card.large ? 218 : undefined,
        flex: card.large ? '0 0 218px' : '1 1 0',
        minWidth: card.large ? 218 : 140,
        transition: 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.22s ease, background 0.25s ease',
        transform: hovered ? 'translateY(-14px) scale(1.035)' : 'translateY(0) scale(1)',
        boxShadow: hovered
          ? `0 28px 70px ${card.shadowColor}, 0 6px 20px ${card.shadowColor}`
          : '0 2px 14px rgba(10,15,30,0.055)',
        textDecoration: 'none',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Hover glow layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 22,
        background: `radial-gradient(ellipse at 50% 0%, ${card.accentColor}12 0%, transparent 70%)`,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.35s ease',
        pointerEvents: 'none',
      }} />

      {/* Icon badge */}
      <div style={{
        width: card.large ? 50 : 38,
        height: card.large ? 50 : 38,
        borderRadius: 13,
        background: card.accentBg,
        border: `1px solid ${card.accentColor}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        <Icon size={card.large ? 22 : 17} style={{ color: card.accentColor }} />
      </div>

      {/* Graph visual — large card only */}
      {card.large && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        }}>
          <PeopleGraphic color={card.accentColor} />
        </div>
      )}

      {/* Spacer for small cards */}
      {!card.large && <div style={{ flex: 1 }} />}

      {/* Label */}
      <p style={{
        fontFamily: 'var(--font-cormorant, "Cormorant Garamond", Georgia, serif)',
        fontSize: card.large ? 30 : 22,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color: 'var(--ink)',
        lineHeight: 1,
        marginBottom: 7,
        position: 'relative',
        zIndex: 1,
      }}>
        {card.label}
      </p>

      {/* Title */}
      <p style={{
        fontSize: card.large ? 12 : 10.5,
        fontWeight: 700,
        color: card.accentColor,
        marginBottom: 6,
        lineHeight: 1.3,
        position: 'relative',
        zIndex: 1,
      }}>
        {card.title}
      </p>

      {/* Description */}
      <p style={{
        fontSize: card.large ? 11.5 : 10,
        color: 'var(--ink-soft)',
        lineHeight: 1.55,
        marginBottom: card.large ? 14 : 10,
        position: 'relative',
        zIndex: 1,
      }}>
        {card.desc}
      </p>

      {/* CTA */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 700,
        color: card.accentColor,
        position: 'relative',
        zIndex: 1,
      }}>
        Learn More
        <ArrowRight size={11} style={{ transition: 'transform 0.2s ease', transform: hovered ? 'translateX(3px)' : 'none' }} />
      </div>
    </Link>
  );
}

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse at 70% 20%, rgba(124,58,237,0.07) 0%, transparent 55%)',
            'radial-gradient(ellipse at 15% 75%, rgba(234,61,196,0.05) 0%, transparent 50%)',
          ].join(', '),
        }}
      />

      <div className="relative z-10 container-wide section-padding w-full pt-36 pb-24">

        {/* Centred logo + tagline */}
        <div className="flex flex-col items-center text-center mb-12">
          <Image
            src={LOGO_FULL}
            alt="The People System"
            width={520}
            height={168}
            className="object-contain w-auto mb-5"
            style={{ height: '118px' }}
            priority
          />
          <p
            className="text-[11px] font-bold uppercase tracking-[0.24em]"
            style={{ color: 'var(--ink-faint)' }}
          >
            Hire.&nbsp;&nbsp;Lead.&nbsp;&nbsp;Protect.
          </p>
        </div>

        {/* Main grid: left text | right cards */}
        <div className="grid lg:grid-cols-[42%_58%] gap-10 xl:gap-14 items-end">

          {/* ── Left: messaging + CTAs + stats ── */}
          <div>
            <h1
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(2.8rem, 5.2vw, 4.8rem)',
                fontWeight: 800,
                lineHeight: 1.0,
                letterSpacing: '-0.04em',
                color: 'var(--ink)',
              }}
            >
              <span className="text-gradient">The People System</span>
            </h1>

            <p
              className="text-lg leading-relaxed mb-5 max-w-[480px]"
              style={{ color: 'var(--ink-soft)' }}
            >
              Hire the right people. Lead your managers. Protect your business.
              One partner. The expertise you need. The portal that keeps you in control.
            </p>

            <p
              className="text-sm leading-relaxed mb-8 max-w-[440px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              Built for senior leaders at growing businesses who need a proper People
              function without the full-time headcount cost.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/smart-hiring-system" className="btn-secondary">
                See how it works <ArrowRight size={15} />
              </Link>
            </div>

            {/* Stats row */}
            <div
              className="flex flex-wrap gap-8 pt-8"
              style={{ borderTop: '1px solid var(--brand-line)' }}
            >
              {STATS.map((m) => (
                <div key={m.lab}>
                  <p
                    style={{
                      fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                      fontSize: '2rem',
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: '-0.025em',
                      marginBottom: 4,
                      background: m.gold ? 'var(--gold-gloss)' : 'linear-gradient(135deg,#EA3DC4,#7C3AED)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {m.val}
                  </p>
                  <p className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                    {m.lab}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: 4 morphing cards ── */}
          <div className="hidden lg:flex items-end gap-3">
            {CARDS.map((card) => (
              <HeroCard key={card.id} card={card} />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

// Keep BARS exported so it can be imported by other components if needed
export { BARS };
