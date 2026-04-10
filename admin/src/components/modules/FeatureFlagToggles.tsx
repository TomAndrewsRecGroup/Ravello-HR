'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';

/* ─── Flag structure: grouped by module ─────────────── */
interface FlagGroup {
  label: string;
  description: string;
  flags: { key: string; label: string }[];
}

const FLAG_GROUPS: FlagGroup[] = [
  {
    label: 'HIRE',
    description: 'Recruitment and talent acquisition',
    flags: [
      { key: 'hiring',          label: 'Hiring Pipeline' },
      { key: 'friction_lens',   label: 'Friction Lens Scoring' },
      { key: 'benchmarks',      label: 'Salary Benchmarks' },
      { key: 'hiring_analytics', label: 'Hiring Analytics' },
      { key: 'jd_templates',    label: 'JD Templates' },
      { key: 'manatal_ats',     label: 'Manatal ATS Integration' },
    ],
  },
  {
    label: 'LEAD',
    description: 'People development and learning',
    flags: [
      { key: 'lead',              label: 'LEAD Module (master)' },
      { key: 'employee_records',  label: 'Employee Records' },
      { key: 'hr_reports',        label: 'HR Reports' },
      { key: 'training',          label: 'Training Needs' },
      { key: 'reviews',           label: 'Performance Reviews' },
      { key: 'skills_matrix',     label: 'Skills Matrix' },
      { key: 'learning',          label: 'E-Learning Marketplace' },
      { key: 'onboarding',        label: 'Onboarding Workflows' },
      { key: 'org_chart',         label: 'Organisation Chart' },
      { key: 'documents',         label: 'Document Management' },
      { key: 'roadmap',           label: 'Roadmap' },
    ],
  },
  {
    label: 'PROTECT',
    description: 'Compliance, absence and risk',
    flags: [
      { key: 'protect',              label: 'PROTECT Module (master)' },
      { key: 'compliance',           label: 'Compliance Tracking' },
      { key: 'absence',              label: 'Absence Management' },
      { key: 'employee_docs',        label: 'Employee Documents' },
      { key: 'offboarding',          label: 'Offboarding Workflows' },
      { key: 'policy_acknowledgement', label: 'Policy Acknowledgements' },
      { key: 'protect_dashboard',    label: 'HR Dashboard' },
      { key: 'protect_reports',      label: 'PROTECT Reports' },
    ],
  },
  {
    label: 'General',
    description: 'Platform-wide features',
    flags: [
      { key: 'support',    label: 'HR Support & Tickets' },
      { key: 'metrics',    label: 'Metrics Dashboard' },
      { key: 'reports',    label: 'CSV Reports' },
      { key: 'calendar',   label: 'Company Calendar' },
    ],
  },
];

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
                  <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{group.label}</p>
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
