const SIGNALS = [
  { icon: '🏆', text: 'Senior HR expertise, not junior consultants' },
  { icon: '⚡',    text: 'Embedded fast — typically within 48 hours' },
  { icon: '🔒', text: '100% confidential engagements' },
  { icon: '📋', text: 'Fixed-scope, no surprise invoices' },
  { icon: '✅', text: '0 tribunal outcomes across all restructure work' },
];

export default function TrustBar() {
  return (
    <div
      className="relative overflow-hidden"
      style={{ background: 'var(--brand-navy)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Gradient top line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--gradient)' }} />

      <div className="container-wide px-6 lg:px-10 py-4">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5">
          {SIGNALS.map((s) => (
            <div key={s.text} className="flex items-center gap-2 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="text-sm">{s.icon}</span>
              {s.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
