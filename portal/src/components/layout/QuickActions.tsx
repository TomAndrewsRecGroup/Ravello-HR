'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Briefcase, Palmtree, LifeBuoy, FileText, X,
  UserPlus, CalendarDays, ShieldCheck, BookOpen,
  Settings as SettingsIcon, Check,
} from 'lucide-react';
import { useUserPreferences } from './UserPreferences';

/* All available quick actions */
const ALL_ACTIONS: Record<string, { label: string; href: string; icon: React.ElementType; color: string }> = {
  raise_role:     { label: 'Raise a Role',    href: '/hire/hiring/new',    icon: Briefcase,    color: 'var(--purple)' },
  log_leave:      { label: 'Log Leave',       href: '/calendar',           icon: Palmtree,     color: 'var(--success)' },
  raise_ticket:   { label: 'Raise a Ticket',  href: '/support/new',        icon: LifeBuoy,     color: 'var(--amber)' },
  upload_doc:     { label: 'Upload Document', href: '/lead/documents',     icon: FileText,     color: 'var(--blue)' },
  add_employee:   { label: 'Add Employee',    href: '/lead/employee-records', icon: UserPlus,  color: 'var(--teal)' },
  view_calendar:  { label: 'View Calendar',   href: '/calendar',           icon: CalendarDays, color: '#6366F1' },
  compliance:     { label: 'Compliance',       href: '/protect/compliance', icon: ShieldCheck,  color: 'var(--danger)' },
  learning:       { label: 'Learning',         href: '/lead/learning',      icon: BookOpen,     color: '#8B5CF6' },
};

const DEFAULT_ACTIONS = ['raise_role', 'log_leave', 'raise_ticket', 'upload_doc'];

export default function QuickActions() {
  const router = useRouter();
  const { prefs, updatePrefs } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const activeKeys = prefs.quick_actions?.length > 0 ? prefs.quick_actions : DEFAULT_ACTIONS;
  const activeActions = activeKeys.map(k => ALL_ACTIONS[k]).filter(Boolean);

  async function toggleAction(key: string) {
    const current = [...activeKeys];
    const idx = current.indexOf(key);
    if (idx >= 0) {
      if (current.length <= 1) return; // must have at least 1
      current.splice(idx, 1);
    } else {
      if (current.length >= 6) return; // max 6
      current.push(key);
    }
    await updatePrefs({ quick_actions: current });
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Action buttons */}
      {open && !editing && (
        <div className="flex flex-col gap-2" style={{ animation: 'fadeUp 0.15s ease' }}>
          {activeActions.map(action => (
            <button
              key={action.label}
              onClick={() => { router.push(action.href); setOpen(false); }}
              className="flex items-center gap-2.5 pl-4 pr-5 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all hover:scale-[1.02]"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }}
            >
              <action.icon size={15} style={{ color: action.color }} />
              {action.label}
            </button>
          ))}
          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2.5 pl-4 pr-5 py-2 rounded-xl text-xs font-medium transition-all"
            style={{ color: 'var(--ink-faint)' }}
          >
            <SettingsIcon size={12} /> Customise actions
          </button>
        </div>
      )}

      {/* Edit mode */}
      {open && editing && (
        <div className="w-[260px] rounded-xl shadow-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--line)', animation: 'fadeUp 0.15s ease' }}>
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Choose Quick Actions</p>
            <button onClick={() => setEditing(false)} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--purple)' }}>
              <Check size={12} /> Done
            </button>
          </div>
          <div className="p-2 max-h-[300px] overflow-y-auto">
            {Object.entries(ALL_ACTIONS).map(([key, action]) => {
              const isActive = activeKeys.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleAction(key)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-soft)]"
                >
                  <div
                    className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: isActive ? 'var(--purple)' : 'var(--line)',
                      background: isActive ? 'var(--purple)' : 'transparent',
                    }}
                  >
                    {isActive && <Check size={10} style={{ color: '#fff' }} />}
                  </div>
                  <action.icon size={14} style={{ color: action.color, flexShrink: 0 }} />
                  <span className="text-xs font-medium" style={{ color: isActive ? 'var(--ink)' : 'var(--ink-faint)' }}>
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>Select 1–6 actions</p>
          </div>
        </div>
      )}

      {/* FAB trigger */}
      <button
        onClick={() => { setOpen(!open); if (open) setEditing(false); }}
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
        style={{ background: open ? 'var(--ink)' : 'var(--gradient)', color: '#fff' }}
        aria-label={open ? 'Close' : 'Quick actions'}
      >
        {open ? <X size={20} /> : <Plus size={22} />}
      </button>
    </div>
  );
}
