'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { FLAG_GROUPS, type FlagGroup } from '@/lib/featureFlags';

interface Props {
  companyId: string;
  flags: Record<string, boolean>;
}

export default function FeatureFlagToggles({ companyId, flags }: Props) {
  const supabase = createClient();
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>(flags);
  const [saving, setSaving] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function toggle(key: string) {
    // Disabling a feature is destructive — it can take a paying client's
    // module away. Require an explicit confirm. Enabling is constructive
    // and stays one-click.
    const turningOff = !!localFlags[key];
    if (turningOff) {
      const flagLabel = FLAG_GROUPS
        .flatMap(g => g.flags)
        .find(f => f.key === key)?.label ?? key;
      if (!window.confirm(`Disable "${flagLabel}" for this client? They will lose access to this feature in the portal.`)) {
        return;
      }
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
    // Bulk disable is the most destructive action on this page — it can
    // strip a whole module from a client in one click. Confirm with the
    // module name and feature count.
    if (!on) {
      if (!window.confirm(`Disable all ${group.flags.length} ${group.label} feature${group.flags.length !== 1 ? 's' : ''} for this client? They will lose access to every ${group.label} feature in the portal.`)) {
        return;
      }
    }
    setSaving(group.label);
    setLocalFlags(prev => {
      const updated = { ...prev };
      for (const f of group.flags) {
        updated[f.key] = on;
      }
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

  const totalOn = Object.values(localFlags).filter(Boolean).length;
  const totalFlags = FLAG_GROUPS.reduce((s, g) => s + g.flags.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>
        {totalOn} / {totalFlags} features enabled
      </p>

      {FLAG_GROUPS.map(group => {
        const groupOn = group.flags.filter(f => !!localFlags[f.key]).length;
        const isCollapsed = collapsed[group.label];
        const allOn = groupOn === group.flags.length;
        const noneOn = groupOn === 0;

        return (
          <div key={group.label} className="rounded-lg" style={{ border: '1px solid var(--line)' }}>
            {/* Group header */}
            <div
              className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
              style={{ background: 'var(--surface-soft)' }}
              onClick={() => toggleCollapse(group.label)}
            >
              <div className="flex items-center gap-2">
                {isCollapsed
                  ? <ChevronRight size={13} style={{ color: 'var(--ink-faint)' }} />
                  : <ChevronDown size={13} style={{ color: 'var(--ink-faint)' }} />}
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{group.label}</p>
                    {group.tier === 'free' && (
                      <span
                        className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                        style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--emerald)' }}
                      >Free</span>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{group.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                  {groupOn}/{group.flags.length}
                </span>
                {saving === group.label ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                ) : (
                  <button
                    onClick={() => toggleGroup(group, !allOn)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors"
                    style={{
                      background: allOn ? 'rgba(217,68,68,0.08)' : 'rgba(52,211,153,0.10)',
                      color: allOn ? 'var(--rose)' : 'var(--emerald)',
                    }}
                  >
                    {allOn ? 'All Off' : 'All On'}
                  </button>
                )}
              </div>
            </div>

            {/* Flags */}
            {!isCollapsed && (
              <div className="px-3 py-1">
                {group.flags.map(flag => {
                  const on = !!localFlags[flag.key];
                  return (
                    <div key={flag.key} className="flex items-center justify-between py-1.5">
                      <p className="text-[12px]" style={{ color: on ? 'var(--ink)' : 'var(--ink-faint)' }}>
                        {flag.label}
                      </p>
                      <button
                        onClick={() => toggle(flag.key)}
                        disabled={saving === flag.key}
                        aria-label={`Toggle ${flag.label}`}
                      >
                        {saving === flag.key ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />
                        ) : (
                          <div className={`toggle ${on ? 'toggle-on' : 'toggle-off'}`} style={{ transform: 'scale(0.85)' }}>
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
