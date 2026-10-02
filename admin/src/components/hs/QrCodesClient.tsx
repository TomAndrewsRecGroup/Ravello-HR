'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, QrCode } from 'lucide-react';
import EntityQrPanel from './EntityQrPanel';

export interface QrItem {
  id: string;
  label: string;
  subtitle: string | null;
  apiPath: string;
  active: boolean;
}

interface Props {
  companyName: string;
  equipment: QrItem[];
  coshh: QrItem[];
  loadError: string | null;
}

// One place to mint/revoke every entity QR code (196) for a client,
// instead of digging into each equipment row or switching to the
// portal to find a COSHH assessment. The underlying mint/revoke call
// is unchanged — this is purely a convenience list over the same
// EntityQrPanel the Equipment tab and portal COSHH page already use.
export default function QrCodesClient({ companyName, equipment, coshh, loadError }: Props) {
  return (
    <div className="space-y-6">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the full list: {loadError}</p>}
      <Section title="Equipment" items={equipment} companyName={companyName} empty="No equipment on the register yet." />
      <Section title="COSHH assessments" items={coshh} companyName={companyName} empty="No COSHH assessments recorded yet." />
    </div>
  );
}

function Section({ title, items, companyName, empty }: { title: string; items: QrItem[]; companyName: string; empty: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
      {items.length === 0 ? (
        <div className="card empty-state p-10">
          <QrCode size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{empty}</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {items.map(item => {
            const isOpen = expanded === item.id;
            return (
              <li key={item.id}>
                <button className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : item.id)}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{item.label}</span>
                    {item.subtitle && <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{item.subtitle}</span>}
                  </span>
                  <span className="text-xs whitespace-nowrap" style={{ color: item.active ? 'var(--teal)' : 'var(--ink-faint)' }}>
                    {item.active ? 'QR active' : 'No QR code'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pl-11">
                    <EntityQrPanel
                      apiPath={item.apiPath}
                      hasActiveBadge={item.active}
                      canManage
                      label={item.label}
                      subtitle={item.subtitle}
                      companyName={companyName}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
