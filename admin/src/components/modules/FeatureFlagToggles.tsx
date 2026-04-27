'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, ChevronDown,
  Briefcase, BookOpen, ShieldCheck, Settings, Trophy,
} from 'lucide-react';
import { FLAG_GROUPS, type FlagGroup } from '@/lib/featureFlags';

interface Props {
  companyId: string;
  flags: Record<string, boolean>;
}

const GROUP_ICON: Record<string, typeof Briefcase> = {
  HIRE:       Briefcase,
  LEAD:       BookOpen,
  PROTECT:    ShieldCheck,
  General:    Settings,
  Programmes: Trophy,
};

export default function FeatureFlagToggles({ companyId, flags }: Props) {
  const supabase = createClient();
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>(flags);
  const [saving, setSaving] = useState<string | null>(null);
  // Default state: collapsed except groups with at least one flag on, so
  // active modules surface their detail without forcing the admin to
  // expand five empty cards just to see "0/4 enabled".
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of FLAG_GROUPS) {
      init[g.label] = g.flags.every(f => !flags[f.key]);
    }
    return init;
  });

  async function toggle(key: string) {
    const turningOff = !!localFlags[key];
    if (turningOff) {
      const flagLabel = FLAG_GROUPS
        .flatMap(g => g.flags)
        .find(f => f.key === key)?.label ?? key;
      const isLastEnabled = Object.values(localFlags).filter(Boolean).length === 1;
      const msg = isLastEnabled
        ? `Disable "${flagLabel}" for this client? This is the last enabled feature — they will have an empty portal until a feature is re-enabled.`
        : `Disable "${flagLabel}" for this client? They will lose access to this feature in the portal.`;
      if (!window.confirm(msg)) return;
    }
    setSaving(key);
    setLocalFlags(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      supabase
        .from('companies')
        .update({ feature_flags: updated })
        .eq('id', companyId)
        .then(() => setSaving(null));
      return updated;
    });
  }

  async function toggleGroup(group: FlagGroup, on: boolean) {
    if (!on) {
      const groupKeys = new Set(group.flags.map(f => f.key));
      const remainingOn = Object.entries(localFlags)
        .filter(([k, v]) => v && !groupKeys.has(k)).length;
      const noFeaturesLeft = remainingOn === 0;
      const suffix = noFeaturesLeft
        ? ' This will leave the client with no features in their portal.'
        : '';
      if (!window.confirm(`Disable all ${group.flags.length} ${group.label} feature${group.flags.length !== 1 ? 's' : ''} for this client? They will lose access to every ${group.label} feature in the portal.${suffix}`)) {
        return;
      }
    }
    setSaving(group.label);
    setLocalFlags(prev => {
      const updated = { ...prev };
      for (const f of group.flags) updated[f.key] = on;
      supabase
        .from('companies')
        .update({ feature_flags: updated })
        .eq('id', companyId)
        .then(() => setSaving(null));
      return updated;
    });
  }

  function toggleCollapse(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  const totalOn    = Object.values(localFlags).filter(Boolean).length;
  const totalFlags = FLAG_GROUPS.reduce((s, g) => s + g.flags.length, 0);

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Module access</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            {totalOn} of {totalFlags} features enabled
          </p>
        </div>
      </div>

      {FLAG_GROUPS.map(group => {
        const groupOn      = group.flags.filter(f => !!localFlags[f.key]).length;
        const groupTotal   = group.flags.length;
        const isCollapsed  = collapsed[group.label];
        const allOn        = groupOn === groupTotal;
        const noneOn       = groupOn === 0;
        const Icon         = GROUP_ICON[group.label] ?? Settings;
        const pct          = groupTotal === 0 ? 0 : (groupOn / groupTotal) * 100;
        const isSaving     = saving === group.label;
        const isFree       = group.tier === 'free';

        // Expanded cards get a subtle purple tint on the icon chip;
        // collapsed/empty cards stay neutral so the eye is drawn to
        // the modules with active features.
        const accent = noneOn ? 'var(--ink-faint)' : 'var(--purple)';
        const iconBg = noneOn ? 'var(--surface-soft)' : 'rgba(124,58,237,0.08)';

        return (
          <div
            key={group.label}
            className="card overflow-hidden"
            style={{
              transition: 'border-color 150ms, box-shadow 150ms',
              borderColor: !isCollapsed && !noneOn ? 'rgba(124,58,237,0.18)' : 'var(--line)',
            }}
          >
            {/* Header — clickable row */}
            <button
              type="button"
              onClick={() => toggleCollapse(group.label)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-soft)] transition-colors"
            >
              {/* Module icon */}
              <div
                className="flex-shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center"
                style={{ background: iconBg, color: accent }}
              >
                <Icon size={17} />
              </div>

              {/* Title + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
                    {group.label}
                  </p>
                  {isFree && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-md"
                      style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}
                    >
                      Free
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ink-faint)' }}>
                  {group.description}
                </p>
              </div>

              {/* Progress + count */}
              <div className="flex-shrink-0 flex items-center gap-3">
                {/* Slim progress bar */}
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: noneOn ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
                    {groupOn}/{groupTotal}
                  </span>
                  <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: allOn ? 'var(--teal)' : 'var(--purple)',
                      }}
                    />
                  </div>
                </div>

                {/* Chevron */}
                <ChevronDown
                  size={16}
                  className="transition-transform duration-200"
                  style={{
                    color: 'var(--ink-faint)',
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                  }}
                />
              </div>
            </button>

            {/* Body — expanded content */}
            {!isCollapsed && (
              <div
                className="border-t px-4 py-3 space-y-2"
                style={{ borderColor: 'var(--line)', background: 'var(--surface-soft)' }}
              >
                {/* Bulk action row */}
                <div className="flex items-center justify-between pb-2 mb-1" style={{ borderBottom: '1px dashed var(--line)' }}>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-soft)' }}>
                    Bulk actions
                  </span>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                    ) : (
                      <>
                        <button
                          onClick={() => toggleGroup(group, true)}
                          disabled={allOn}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}
                        >
                          Enable all
                        </button>
                        <button
                          onClick={() => toggleGroup(group, false)}
                          disabled={noneOn}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}
                        >
                          Disable all
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Individual flags */}
                {group.flags.map(flag => {
                  const on = !!localFlags[flag.key];
                  const flagSaving = saving === flag.key;
                  return (
                    <div
                      key={flag.key}
                      className="flex items-center justify-between py-1.5 px-1 rounded-md hover:bg-white transition-colors"
                    >
                      <p className="text-[13px] font-medium" style={{ color: on ? 'var(--ink)' : 'var(--ink-faint)' }}>
                        {flag.label}
                      </p>
                      <button
                        onClick={() => toggle(flag.key)}
                        disabled={flagSaving}
                        aria-label={`Toggle ${flag.label}`}
                        className="flex items-center"
                      >
                        {flagSaving ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                        ) : (
                          <div className={`toggle ${on ? 'toggle-on' : 'toggle-off'}`}>
                            <div className={`toggle-knob ${on ? 'toggle-knob-on' : 'toggle-knob-off'}`} />
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
