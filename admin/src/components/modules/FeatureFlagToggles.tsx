'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const FLAG_LABELS: Record<string, string> = {
  hiring:        'Hiring Module',
  lead:          'LEAD Module',
  protect:       'PROTECT Module',
  documents:     'Document Management',
  reports:       'Reports',
  support:       'HR Support Requests',
  metrics:       'Metrics Dashboard',
  compliance:    'Compliance Tracking',
  learning:      'E-Learning Marketplace',
  benchmarks:    'Salary Benchmarks',
  friction_lens: 'Friction Lens',
};

interface Props {
  companyId: string;
  flags: Record<string, boolean>;
}

export default function FeatureFlagToggles({ companyId, flags }: Props) {
  const supabase = createClient();
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>(flags);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: string) {
    const newVal = !localFlags[key];
    setSaving(key);
    setLocalFlags(prev => ({ ...prev, [key]: newVal }));
    await supabase
      .from('companies')
      .update({ feature_flags: { ...localFlags, [key]: newVal } })
      .eq('id', companyId);
    setSaving(null);
  }

  return (
    <div className="space-y-3">
      {Object.keys(FLAG_LABELS).map((key) => {
        const on = !!localFlags[key];
        return (
          <div key={key} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{FLAG_LABELS[key]}</p>
              <span className={`badge mt-0.5 ${on ? 'badge-on' : 'badge-off'}`}>{on ? 'On' : 'Off'}</span>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saving === key}
              className="relative"
              aria-label={`Toggle ${FLAG_LABELS[key]}`}
            >
              {saving === key ? (
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--purple)' }} />
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
  );
}
