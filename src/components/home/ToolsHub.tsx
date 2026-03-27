import Link from 'next/link';
import { ArrowRight, BarChart2, ShieldAlert, FileCheck, ClipboardList } from 'lucide-react';

const TOOLS = [
  {
    icon: BarChart2,
    href: '/tools/hiring-score',
    name: 'Hiring Score',
    problem: 'Understand where your hiring process is costing you time and money.',
    color: '#7B2FBE',
    bg: 'rgba(123,47,190,0.08)',
    hoverBorder: 'rgba(123,47,190,0.25)',
  },
  {
    icon: ShieldAlert,
    href: '/tools/hr-risk-score',
    name: 'HR Risk Score',
    problem: 'Identify gaps that could expose your business to risk.',
    color: '#4B6EF5',
    bg: 'rgba(75,110,245,0.08)',
    hoverBorder: 'rgba(75,110,245,0.25)',
  },
  {
    icon: FileCheck,
    href: '/tools/policy-healthcheck',
    name: 'Policy Healthcheck',
    problem: 'Check if your current documents actually protect your business.',
    color: '#C026A0',
    bg: 'rgba(192,38,160,0.08)',
    hoverBorder: 'rgba(192,38,160,0.25)',
  },
  {
    icon: ClipboardList,
    href: '/tools/due-diligence-checklist',
    name: 'Due Diligence Checklist',
    problem: 'Prepare properly for growth, investment, or acquisition.',
    color: '#5A9E6F',
    bg: 'rgba(90,158,111,0.08)',
    hoverBorder: 'rgba(90,158,111,0.25)',
  },
];

export default function ToolsHub() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface-alt)' }}>
      <style>{`
        .tool-card {
          display: flex;
          flex-direction: column;
          border-radius: 18px;
          padding: 1.5rem;
          background: #fff;
          border: 1px solid var(--brand-line);
          box-shadow: 0 2px 6px rgba(13,21,53,0.04);
          text-decoration: none;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .tool-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(13,21,53,0.09);
        }
      `}</style>

      <div className="container-wide">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
              />
              Free tools
            </p>
            <h2 className="section-title">
              Know exactly<br />where the gaps are
            </h2>
          </div>
          <p className="text-sm max-w-[320px]" style={{ color: 'var(--ink-faint)' }}>
            Under 3 minutes each. No account needed. Instant results.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href} className="tool-card">
                <div
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-5"
                  style={{ background: t.bg }}
                >
                  <Icon size={20} style={{ color: t.color }} />
                </div>

                <h3
                  className="font-bold text-[1rem] mb-2 leading-snug"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                >
                  {t.name}
                </h3>
                <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: 'var(--ink-soft)' }}>
                  {t.problem}
                </p>

                <div
                  className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: t.color }}
                >
                  Run assessment <ArrowRight size={12} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
