'use client';
interface Props { title: string; subtitle?: string; actions?: React.ReactNode; }
export default function AdminTopbar({ title, subtitle, actions }: Props) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 lg:px-8"
      style={{ height: 'var(--topbar-h)', background: 'rgba(241,242,247,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}
    >
      <div>
        <h1 className="font-display font-bold text-[1.05rem]" style={{ color: 'var(--ink)' }}>{title}</h1>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
