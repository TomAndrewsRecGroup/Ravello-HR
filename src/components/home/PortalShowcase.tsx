'use client';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, ShieldCheck, BookOpen, Users, FolderOpen, BarChart3,
  TrendingUp, LifeBuoy, ArrowRight, Upload, AlertTriangle,
  ChevronRight, FileText, Activity,
} from 'lucide-react';

/* ─── Feature grid data ─── */
const FEATURES = [
  {
    icon: Briefcase,
    title: 'Hiring Pipeline',
    desc: 'Track every role from brief to offer. Candidate stages, interview schedules, and role scores. One view. No chasing.',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.08)',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance Tracker',
    desc: 'Never miss a deadline. Due dates, status workflows, and overdue alerts by category. Stay ahead, not behind.',
    color: '#14B8A6',
    bg: 'rgba(20,184,166,0.08)',
  },
  {
    icon: BookOpen,
    title: 'LEAD Module',
    desc: 'Training needs, performance reviews, and a full skills matrix. Develop your people with structure, not guesswork.',
    color: '#3B6FFF',
    bg: 'rgba(59,111,255,0.08)',
  },
  {
    icon: Users,
    title: 'PROTECT Module',
    desc: 'Employee documents, absence management, and an HR dashboard. Headcount, turnover, and diversity. All tracked.',
    color: '#EA3DC4',
    bg: 'rgba(234,61,196,0.08)',
  },
  {
    icon: FolderOpen,
    title: 'Document Library',
    desc: 'Contracts, policies, handbooks. Versioned, organised by category, and always current. Nothing out of date.',
    color: '#BF8F28',
    bg: 'rgba(191,143,40,0.08)',
  },
  {
    icon: TrendingUp,
    title: 'Metrics and Analytics',
    desc: 'Hiring performance, compliance health, salary benchmarks. One dashboard that tells you what is actually happening.',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.08)',
  },
  {
    icon: LifeBuoy,
    title: 'Support and Requests',
    desc: 'Raise tickets, request HR services, track responses. Everything logged. Nothing dropped.',
    color: '#3B6FFF',
    bg: 'rgba(59,111,255,0.08)',
  },
  {
    icon: BarChart3,
    title: 'Reports and Exports',
    desc: 'Live CSV reports on roles, candidates, compliance, and actions. Ready for board packs or investor updates.',
    color: '#047857',
    bg: 'rgba(4,120,87,0.08)',
  },
];

/* ─── Portal mockup data ─── */
const NAV_ITEMS = [
  { label: 'Dashboard',   badge: null },
  { label: 'Hiring',      badge: 3    },
  { label: 'LEAD',        badge: null },
  { label: 'PROTECT',     badge: null },
  { label: 'Compliance',  badge: 2    },
  { label: 'Documents',   badge: null },
  { label: 'Support',     badge: null },
  { label: 'Metrics',     badge: null },
];

const FRICTION_BARS = [
  { label: 'Location',      val: 78, color: '#D94444' },
  { label: 'Salary',        val: 62, color: '#E8954A' },
  { label: 'Skills',        val: 45, color: '#28C840' },
  { label: 'Working Model', val: 80, color: '#D94444' },
  { label: 'Process',       val: 22, color: '#28C840' },
];

const DOCS = [
  { name: 'Employee Handbook v3', size: '2.4 MB', review: false },
  { name: 'GDPR Policy v2',       size: '840 KB', review: true  },
  { name: 'Contract Template',    size: '1.1 MB', review: false },
  { name: 'Health & Safety',      size: '560 KB', review: false },
];

const BROWSER_CLOSED   = 52;   // px — URL bar height only
const BROWSER_OPEN     = 620;  // px — full portal

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

/* ─── Scroll progress hook ─── */
function useScrollProgress(ref: React.RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect   = el.getBoundingClientRect();
      const winH   = window.innerHeight;
      const entered = winH - rect.top;                        // px scrolled into section
      const travel  = el.offsetHeight - winH;                 // full scroll range
      setProgress(Math.max(0, Math.min(1, entered / (travel * 0.55))));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref]);
  return progress;
}

/* ─── Portal mockup interior ─── */
function PortalContent({ opacity }: { opacity: number }) {
  return (
    <div style={{ display: 'flex', height: BROWSER_OPEN - BROWSER_CLOSED, opacity, background: '#EFF0F7', overflow: 'hidden' }}>

      {/* Dark sidebar */}
      <div style={{ width: 148, background: '#070B20', flexShrink: 0, padding: '12px 10px', display: 'flex', flexDirection: 'column' }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#7C3AED,#3B6FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={13} color="#fff" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>TPS Portal</span>
        </div>

        {NAV_ITEMS.map((item, i) => (
          <div key={item.label} style={{
            padding: '7px 10px', borderRadius: 7, marginBottom: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 10, fontWeight: i === 1 ? 700 : 500,
            color:      i === 1 ? '#fff' : 'rgba(255,255,255,0.35)',
            background: i === 1 ? 'rgba(124,58,237,0.28)' : 'transparent',
          }}>
            {item.label}
            {item.badge && (
              <span style={{ background: '#7C3AED', color: '#fff', fontSize: 8, fontWeight: 800, borderRadius: 99, padding: '1px 5px' }}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Main dashboard area */}
      <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { label: 'Active Roles',   val: '4',   color: '#7C3AED' },
            { label: 'Compliance',     val: '96%', color: '#14B8A6' },
            { label: 'Open Actions',   val: '7',   color: '#3B6FFF' },
            { label: 'Candidates',     val: '3',   color: '#EA3DC4' },
          ].map((s) => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(10,15,30,0.07)', borderRadius: 10, padding: '9px 10px' }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: s.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.val}</p>
              <p style={{ fontSize: 9, color: '#748099', fontWeight: 500, marginTop: 3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Row 2: Friction Lens role + Company score */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 185px', gap: 8 }}>

          {/* Friction Lens — Role */}
          <div style={{ background: '#fff', border: '1px solid rgba(10,15,30,0.07)', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 }}>
              <div>
                <p style={{ fontSize: 8.5, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Friction Lens — Role
                </p>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#070B1D' }}>Senior Developer</p>
                <p style={{ fontSize: 9, color: '#748099' }}>Product Engineering · London (Hybrid)</p>
              </div>
              <div style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.18)', borderRadius: 9, padding: '5px 10px', textAlign: 'center', flexShrink: 0 }}>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#7C3AED', lineHeight: 1 }}>72</p>
                <p style={{ fontSize: 8, color: '#7C3AED', fontWeight: 600 }}>/ 100</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FRICTION_BARS.map((b) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#748099', width: 78, flexShrink: 0 }}>{b.label}</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: '#EFF0F7', overflow: 'hidden' }}>
                    <div style={{ width: `${b.val}%`, height: '100%', background: b.color, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: b.color, width: 28, textAlign: 'right' }}>{b.val}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Friction Lens — Company */}
          <div style={{ background: '#fff', border: '1px solid rgba(10,15,30,0.07)', borderRadius: 10, padding: '11px 13px', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: 8.5, fontWeight: 700, color: '#3B6FFF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Friction Lens — Company
            </p>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {/* Donut score */}
              <div style={{ position: 'relative', width: 72, height: 72 }}>
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#EFF0F7" strokeWidth="7" />
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#3B6FFF" strokeWidth="7"
                    strokeDasharray={`${2 * Math.PI * 28 * 0.65} ${2 * Math.PI * 28}`}
                    strokeLinecap="round" transform="rotate(-90 36 36)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#3B6FFF', lineHeight: 1 }}>65</span>
                  <span style={{ fontSize: 8, color: '#748099' }}>/ 100</span>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#14B8A6' }}>▲ +5 pts this quarter</p>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[['Hire','#7C3AED'], ['Lead','#EA3DC4'], ['Protect','#14B8A6']].map(([l, c]) => (
                  <span key={l} style={{ padding: '2px 7px', borderRadius: 99, fontSize: 8, fontWeight: 700, background: `${c}18`, color: c }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Documents + HR overview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 185px', gap: 8 }}>

          {/* Documents */}
          <div style={{ background: '#fff', border: '1px solid rgba(10,15,30,0.07)', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: '#070B1D' }}>Document Library</p>
              <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, background: 'rgba(124,58,237,0.10)', color: '#7C3AED', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
                <Upload size={10} /> Upload
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {DOCS.map((d) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, background: '#F8F9FC', border: '1px solid rgba(10,15,30,0.05)' }}>
                  <FileText size={12} style={{ color: '#7C3AED', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 9.5, fontWeight: 600, color: '#38436A' }}>{d.name}</span>
                  <span style={{ fontSize: 8.5, color: '#748099' }}>{d.size}</span>
                  {d.review && <AlertTriangle size={10} style={{ color: '#E8954A' }} />}
                  <ChevronRight size={10} style={{ color: '#C5C9D6' }} />
                </div>
              ))}
            </div>
          </div>

          {/* HR Overview */}
          <div style={{ background: '#fff', border: '1px solid rgba(10,15,30,0.07)', borderRadius: 10, padding: '11px 13px' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: '#070B1D', marginBottom: 9 }}>HR Overview</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { label: 'Headcount',  val: '47',   color: '#070B1D' },
                { label: 'Open Roles', val: '4',    color: '#7C3AED' },
                { label: 'Turnover',   val: '2.1%', color: '#14B8A6' },
                { label: 'Absence',    val: '1.8%', color: '#3B6FFF' },
                { label: 'Compliance', val: '96%',  color: '#14B8A6' },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#748099' }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: r.color, letterSpacing: '-0.02em' }}>{r.val}</span>
                </div>
              ))}
              <div style={{ height: 4, borderRadius: 99, background: '#EFF0F7', overflow: 'hidden', marginTop: 2 }}>
                <div style={{ width: '96%', height: '100%', background: '#14B8A6', borderRadius: 99 }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─── Browser chrome wrapper ─── */
function BrowserWindow({ height, contentOpacity }: { height: number; contentOpacity: number }) {
  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      border: '1px solid rgba(10,15,30,0.10)',
      boxShadow: '0 28px 90px rgba(10,15,30,0.14), 0 4px 20px rgba(10,15,30,0.06)',
      background: '#EFF0F7',
      maxWidth: 920, margin: '0 auto',
    }}>
      {/* URL bar — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: BROWSER_CLOSED, background: '#FAFAFD', borderBottom: '1px solid rgba(10,15,30,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#FF5F57','#FFBD2E','#28C840'].map((c) => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'block' }} />
          ))}
        </div>
        <div style={{ flex: 1, marginLeft: 8, padding: '5px 12px', borderRadius: 7, background: '#EDEEF5', border: '1px solid rgba(10,15,30,0.07)', fontSize: 11, fontWeight: 500, color: '#748099' }}>
          www.portal.thepeoplesystem.co.uk
        </div>
      </div>

      {/* Expandable content area */}
      <div style={{ height: height - BROWSER_CLOSED, overflow: 'hidden' }}>
        <PortalContent opacity={contentOpacity} />
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export default function PortalShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const raw    = useScrollProgress(containerRef);
  const eased  = easeOutCubic(raw);

  const browserH       = BROWSER_CLOSED + (BROWSER_OPEN - BROWSER_CLOSED) * eased;
  const contentOpacity = Math.max(0, Math.min(1, (raw - 0.35) / 0.4));

  return (
    <section style={{ background: 'var(--bg)' }}>

      {/* ── Scroll-travel wrapper ── */}
      <div ref={containerRef} style={{ minHeight: '185vh', position: 'relative' }}>
        <div style={{ position: 'sticky', top: '6vh', paddingBottom: '6vh' }}>
          <div className="container-wide" style={{ padding: '4rem 1.5rem 0' }}>

            {/* Heading */}
            <div className="text-center mb-10">
              <p className="eyebrow mb-4">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
                Client Portal
              </p>
              <h2 className="section-title mb-4" style={{ maxWidth: 560, margin: '0 auto 16px' }}>
                Everything your People Department needs. In one place.
              </h2>
              <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)', maxWidth: 480, margin: '0 auto' }}>
                Every client gets a dedicated portal. Hiring pipeline, compliance tracker,
                documents, HR analytics — all real-time. No chasing.
              </p>
            </div>

            {/* Browser reveal */}
            <div style={{ position: 'relative' }}>
              {/* Ambient glow */}
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%,-50%)',
                width: '65%', height: '55%', pointerEvents: 'none',
                background: 'radial-gradient(ellipse, rgba(124,58,237,0.11) 0%, transparent 70%)',
              }} />
              <BrowserWindow height={browserH} contentOpacity={contentOpacity} />

              {/* Scroll hint */}
              <div style={{ textAlign: 'center', marginTop: 20, opacity: 1 - eased, transition: 'opacity 0.15s ease', pointerEvents: 'none' }}>
                <p style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 500 }}>
                  ↓ Scroll to explore the portal
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Feature cards ── */}
      <div className="container-wide section-padding" style={{ paddingTop: '4rem' }}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="card" style={{ padding: '1.5rem' }}>
                <div className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-4" style={{ background: f.bg }}>
                  <Icon size={20} style={{ color: f.color }} />
                </div>
                <h4 className="font-bold text-[0.95rem] mb-2 leading-snug" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                  {f.title}
                </h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-14">
          <Link href="/book" className="btn-gradient">
            See the portal in action <ArrowRight size={15} />
          </Link>
        </div>
      </div>

    </section>
  );
}
