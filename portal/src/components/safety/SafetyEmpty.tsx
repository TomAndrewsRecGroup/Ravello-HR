import type { LucideIcon } from 'lucide-react';

// Every safety list says what is missing and what to do about it —
// never "No data".
export default function SafetyEmpty({ icon: Icon, title, text, children }: {
  icon: LucideIcon; title: string; text: string; children?: React.ReactNode;
}) {
  return (
    <div className="card p-10">
      <div className="empty-state">
        <Icon size={28} style={{ color: 'var(--teal)' }} />
        <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>{title}</p>
        <p className="text-sm max-w-[380px]" style={{ color: 'var(--ink-faint)' }}>{text}</p>
        {children}
      </div>
    </div>
  );
}
