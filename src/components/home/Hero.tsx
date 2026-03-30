'use client';
import Link from 'next/link';
import { useState, useRef, useEffect, type ElementType } from 'react';
import { CalendarCheck, ArrowRight, Briefcase, Users, ShieldCheck, Network, CheckCircle2 } from 'lucide-react';

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
  points: string[];
  ctaLabel: string;
};

const CARDS: CardDef[] = [
  {
    id: 'people',
    label: 'PEOPLE',
    Icon: Network,
    title: 'Strategic HR Advisory',
    desc: 'We sit alongside your leadership team and help you build a people function that actually works. Strategy, structure, and the day-to-day support that means you are never guessing.',
    href: '/why-ravello',
    large: true,
    accentColor: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.09)',
    shadowColor: 'rgba(124,58,237,0.28)',
    points: [
      'People strategy designed for growing businesses',
      'Manager coaching and capability building',
      'Organisation design, restructure and TUPE',
      'HR function setup, roadmap and governance',
    ],
    ctaLabel: 'Book a Discovery Call',
  },
  {
    id: 'hire',
    label: 'HIRE',
    Icon: Briefcase,
    title: 'Talent Acquisition',
    desc: 'We find the right people, faster. Every role scored before it goes live. Full pipeline visibility. No wasted agency spend. Just structured hiring that sticks.',
    href: '/hire',
    large: false,
    accentColor: '#3B6FFF',
    accentBg: 'rgba(59,111,255,0.09)',
    shadowColor: 'rgba(59,111,255,0.25)',
    points: [
      'Friction Lens™: know the risk before you post',
      'Full pipeline visibility in your client portal',
      'Cut agency spend by 40-60% within 12 months',
      'Salary benchmarking vs live market data',
    ],
    ctaLabel: 'See the HIRE system',
  },
  {
    id: 'lead',
    label: 'LEAD',
    Icon: Users,
    title: 'People Leadership',
    desc: 'Your managers need more than a training day. We build capability, run performance frameworks, and give your leadership team the tools to develop people properly.',
    href: '/lead',
    large: false,
    accentColor: '#EA3DC4',
    accentBg: 'rgba(234,61,196,0.09)',
    shadowColor: 'rgba(234,61,196,0.25)',
    points: [
      'Training needs analysis across your whole team',
      'Structured performance review framework',
      'Skills gap matrix and development planning',
      'Manager development and coaching programmes',
    ],
    ctaLabel: 'See LEAD packages',
  },
  {
    id: 'protect',
    label: 'PROTECT',
    Icon: ShieldCheck,
    title: 'HR Protection',
    desc: 'Contracts, handbooks, compliance. We build the foundations that protect your business and make sure nothing is left to chance when it matters most.',
    href: '/protect',
    large: false,
    accentColor: '#1848CC',
    accentBg: 'rgba(24,72,204,0.09)',
    shadowColor: 'rgba(24,72,204,0.25)',
    points: [
      'Live compliance tracker with overdue alerts',
      'Employee document storage and version control',
      'Absence and leave management dashboard',
      'HR analytics: headcount, turnover, diversity',
    ],
    ctaLabel: 'See PROTECT packages',
  },
];

/* ─── SVG graphic for the PEOPLE card ─── */
function PeopleGraphic({ color, width = 130 }: { color: string; width?: number }) {
  const height = Math.round(width * 100 / 130);
  return (
    <svg width={width} height={height} viewBox="0 0 130 100" fill="none" aria-hidden="true">
      <circle cx="65" cy="32" r="14" fill={`${color}18`} stroke={color} strokeWidth="2" />
      <circle cx="65" cy="32" r="6" fill={color} opacity="0.7" />
      <circle cx="22" cy="80" r="10" fill={`${color}14`} stroke={color} strokeWidth="1.5" />
      <circle cx="22" cy="80" r="4" fill={color} opacity="0.5" />
      <circle cx="108" cy="80" r="10" fill={`${color}14`} stroke={color} strokeWidth="1.5" />
      <circle cx="108" cy="80" r="4" fill={color} opacity="0.5" />
      <circle cx="65" cy="68" r="8" fill={`${color}12`} stroke={color} strokeWidth="1.5" />
      <circle cx="65" cy="68" r="3" fill={color} opacity="0.6" />
      <line x1="65" y1="46" x2="22" y2="70" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="65" y1="46" x2="108" y2="70" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="65" y1="46" x2="65" y2="60" stroke={color} strokeWidth="1" opacity="0.3" />
      <circle cx="42" cy="50" r="3" fill={color} opacity="0.25" />
      <circle cx="90" cy="48" r="2.5" fill={color} opacity="0.20" />
    </svg>
  );
}

/* ─── CardModal — simple centered fade-in modal ─── */
function CardModal({
  card,
  onClose,
}: {
  card: CardDef;
  onClose: () => void;
}) {
  const { Icon } = card;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: visible ? 'rgba(7,11,29,0.55)' : 'rgba(7,11,29,0)',
          backdropFilter: visible ? 'blur(10px)' : 'blur(0px)',
          WebkitBackdropFilter: visible ? 'blur(10px)' : 'blur(0px)',
          transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed', zIndex: 201,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 390, maxHeight: '85vh',
          borderRadius: 24,
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
          border: '1.5px solid var(--brand-line)',
          boxShadow: [`0 0 0 1px ${card.accentColor}18`, `0 0 60px ${card.shadowColor}`, '0 32px 80px rgba(7,11,29,0.25)'].join(', '),
          overflow: 'hidden',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {/* Top radial glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 50% -10%, ${card.accentColor}14 0%, transparent 65%)`,
        }} />

        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          padding: '24px 22px 22px',
          overflowY: 'auto',
        }}>
          {/* Icon badge */}
          <div style={{
            position: 'relative', zIndex: 1,
            width: 48, height: 48, borderRadius: 14,
            background: card.accentBg,
            border: `1px solid ${card.accentColor}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={22} style={{ color: card.accentColor }} />
          </div>

          {/* Label */}
          <p style={{
            position: 'relative', zIndex: 1, marginTop: 16,
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", Georgia, serif)',
            fontSize: 36, fontWeight: 800,
            letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1, marginBottom: 8,
          }}>
            {card.label}
          </p>

          {/* Title */}
          <p style={{ position: 'relative', zIndex: 1, fontSize: 13, fontWeight: 700, color: card.accentColor, marginBottom: 10, lineHeight: 1.3 }}>
            {card.title}
          </p>

          {/* Description */}
          <p style={{ position: 'relative', zIndex: 1, fontSize: 13, lineHeight: 1.65, color: 'var(--ink-soft)', marginBottom: 18 }}>
            {card.desc}
          </p>

          {/* Bullet points */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {card.points.map((pt) => (
              <div key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <CheckCircle2 size={14} style={{ color: card.accentColor, flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>{pt}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link
            href={card.href}
            style={{
              position: 'relative', zIndex: 1,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', borderRadius: 10, alignSelf: 'flex-start',
              background: `linear-gradient(135deg, ${card.accentColor}, ${card.accentColor}BB)`,
              color: '#fff', fontSize: 12.5, fontWeight: 700,
              textDecoration: 'none', letterSpacing: '-0.01em',
              boxShadow: `0 4px 16px ${card.shadowColor}`,
            }}
          >
            {card.ctaLabel} <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </>
  );
}

/* ─── Individual card in the hero row ─── */
function HeroCard({
  card,
  dimmed,
  onOpen,
  onClose,
  divRef,
}: {
  card: CardDef;
  dimmed: boolean;
  onOpen: () => void;
  onClose: () => void;
  divRef?: (el: HTMLDivElement | null) => void;
}) {
  const { Icon } = card;

  return (
    <div
      ref={divRef}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)',
        border: `1.5px solid var(--brand-line)`,
        borderRadius: 22,
        padding: card.large ? '26px 22px 22px' : '18px 16px 16px',
        height: card.large ? 380 : 244,
        width: card.large ? 218 : undefined,
        flex: card.large ? '0 0 218px' : '1 1 0',
        minWidth: card.large ? 218 : 142,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(10,15,30,0.055)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        opacity: dimmed ? 0.45 : 1,
        transform: dimmed ? 'scale(0.97)' : 'scale(1)',
      }}
    >
      {/* Subtle top glow */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 22, pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% -10%, ${card.accentColor}14 0%, transparent 65%)`,
      }} />

      {/* Icon */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: card.large ? 50 : 38,
        height: card.large ? 50 : 38,
        borderRadius: 13,
        background: card.accentBg,
        border: `1px solid ${card.accentColor}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={card.large ? 22 : 17} style={{ color: card.accentColor }} />
      </div>

      {card.large && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <PeopleGraphic color={card.accentColor} />
        </div>
      )}
      {!card.large && <div style={{ flex: 1 }} />}

      <p style={{
        position: 'relative', zIndex: 1,
        fontFamily: 'var(--font-cormorant, "Cormorant Garamond", Georgia, serif)',
        fontSize: card.large ? 30 : 22, fontWeight: 800,
        letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1, marginBottom: 7,
      }}>
        {card.label}
      </p>
      <p style={{
        position: 'relative', zIndex: 1,
        fontSize: card.large ? 12 : 10.5, fontWeight: 700, color: card.accentColor,
        marginBottom: 6, lineHeight: 1.3,
      }}>
        {card.title}
      </p>
      <p style={{
        position: 'relative', zIndex: 1,
        fontSize: card.large ? 11.5 : 10, color: 'var(--ink-soft)',
        lineHeight: 1.55, marginBottom: card.large ? 14 : 10,
      }}>
        {card.desc}
      </p>
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 700, color: card.accentColor,
      }}>
        Learn More <ArrowRight size={11} />
      </div>
    </div>
  );
}

/* ─── Main Hero component ─── */
export default function Hero() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [cardRect, setCardRect] = useState<SourceRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const open = (id: string) => {
    if (timer.current) clearTimeout(timer.current);
    const el = cardRefs.current[id];
    if (el) {
      const r = el.getBoundingClientRect();
      setCardRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    setActiveCard(id);
  };
  const close = () => {
    timer.current = setTimeout(() => setActiveCard(null), 250);
  };
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const activeCardDef = activeCard ? CARDS.find((c) => c.id === activeCard) : null;

  return (
    <>
      <section
        className="relative overflow-hidden"
        style={{ background: 'var(--bg)' }}
      >
        {/* Ambient gradient */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: [
            'radial-gradient(ellipse at 72% 18%, rgba(124,58,237,0.07) 0%, transparent 55%)',
            'radial-gradient(ellipse at 12% 80%, rgba(234,61,196,0.05) 0%, transparent 50%)',
          ].join(', '),
        }} />

        <div className="relative z-10 container-wide section-padding w-full pt-36 pb-24">

          {/* Centred wordmark + tagline */}
          <div className="flex flex-col items-center text-center mb-12">
            <h2
              className="font-display mb-5"
              style={{
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: 'var(--ink)',
              }}
            >
              THE <span className="text-gradient">PEOPLE</span> SYSTEM
            </h2>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: 'var(--ink-faint)' }}>
              Hire.&nbsp;&nbsp;Lead.&nbsp;&nbsp;Protect.
            </p>
          </div>

          {/* Main grid */}
          <div className="grid lg:grid-cols-[40%_60%] gap-10 xl:gap-14 items-center">

            {/* Left: text + CTAs + stats */}
            <div>
              <h1
                className="font-display mb-5"
                style={{
                  fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
                  fontWeight: 800,
                  lineHeight: 1.02,
                  letterSpacing: '-0.04em',
                  color: 'var(--ink)',
                }}
              >
                Your People function.<br />
                <span className="text-gradient">Built properly.</span>
              </h1>

              <p className="text-lg leading-relaxed mb-5 max-w-[480px]" style={{ color: 'var(--ink-soft)' }}>
                Cut agency spend by 40-60%. Get compliant before it costs you.
                Build the People function your business actually needs, without the
                full-time headcount.
              </p>

              <p className="text-sm leading-relaxed mb-8 max-w-[440px]" style={{ color: 'var(--ink-faint)' }}>
                For founders and senior leaders at 10-250 person businesses who are
                done guessing and ready for a proper system. Two senior specialists.
                One partner. No juniors. No handoffs.
              </p>

              <div className="flex flex-wrap gap-4 mb-10">
                <Link href="/book" className="btn-gradient">
                  <CalendarCheck size={16} /> Book a Free 30-min Call
                </Link>
                <Link href="/tools/hiring-score" className="btn-secondary">
                  Get your free Hiring Score <ArrowRight size={15} />
                </Link>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-8 pt-8" style={{ borderTop: '1px solid var(--brand-line)' }}>
                {STATS.map((m) => (
                  <div key={m.lab}>
                    <p style={{
                      fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                      fontSize: '2rem', fontWeight: 800, lineHeight: 1,
                      letterSpacing: '-0.025em', marginBottom: 4,
                      background: m.gold ? 'var(--gold-gloss)' : 'linear-gradient(135deg,#EA3DC4,#7C3AED)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    }}>
                      {m.val}
                    </p>
                    <p className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>{m.lab}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: 4 cards — hover captures position and triggers modal */}
            <div className="hidden lg:flex items-center gap-3">
              {CARDS.map((card) => (
                <HeroCard
                  key={card.id}
                  card={card}
                  dimmed={activeCard !== null && activeCard !== card.id}
                  onOpen={() => open(card.id)}
                  onClose={close}
                  divRef={(el) => { cardRefs.current[card.id] = el; }}
                />
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Modal rendered outside section — morphs from card to viewport centre */}
      {activeCardDef && (
        <CardModal
          card={activeCardDef}
          sourceRect={cardRect}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
          onClose={() => setActiveCard(null)}
        />
      )}
    </>
  );
}

export { BARS };
