'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Briefcase, Palmtree, LifeBuoy, FileText, X, ChevronUp } from 'lucide-react';

const ACTIONS = [
  { label: 'Raise a Role',   href: '/hire/hiring/new', icon: Briefcase, color: 'var(--purple)' },
  { label: 'Log Leave',      href: '/calendar',        icon: Palmtree,  color: '#10B981' },
  { label: 'Raise a Ticket', href: '/support/new',     icon: LifeBuoy,  color: '#D97706' },
  { label: 'Upload Document',href: '/lead/documents',  icon: FileText,  color: 'var(--blue)' },
];

export default function QuickActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Action buttons — shown when open */}
      {open && (
        <div className="flex flex-col gap-2" style={{ animation: 'fadeUp 0.15s ease' }}>
          {ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => { router.push(action.href); setOpen(false); }}
              className="flex items-center gap-2.5 pl-4 pr-5 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
              }}
            >
              <action.icon size={15} style={{ color: action.color }} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* FAB trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
        style={{
          background: open ? 'var(--ink)' : 'var(--gradient)',
          color: '#fff',
        }}
        aria-label={open ? 'Close quick actions' : 'Quick actions'}
      >
        {open ? <X size={20} /> : <Plus size={22} />}
      </button>
    </div>
  );
}
