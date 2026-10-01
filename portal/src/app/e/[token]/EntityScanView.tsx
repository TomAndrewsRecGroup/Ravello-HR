'use client';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { HS_EQUIPMENT_STATUS_LABELS, type HsEquipmentStatus } from '@/lib/hs/vocab';
import { DOC_STATUS_LABELS, type DocStatus } from '@/lib/hs/safetyVocab';
import EntityReportForm from './EntityReportForm';

// Public, anonymous entity badge scan view. Shows the coarse status
// only — never a free-text field (entity_qr_status(), 196, deliberately
// omits every one). Whoever is standing in front of this screen may
// have no platform login at all; this is the whole point of the
// feature, the exact WorkerScanView.tsx precedent applied to an object.

const EQUIPMENT_COLOUR: Record<HsEquipmentStatus, string> = {
  in_service:     'var(--teal)',
  out_of_service: 'var(--red)',
  quarantined:    'var(--red)',
  decommissioned: 'var(--ink-faint)',
};
const DOC_COLOUR: Partial<Record<DocStatus, string>> = {
  active: 'var(--teal)',
  review_due: 'var(--amber)',
  changes_requested: 'var(--amber)',
  superseded: 'var(--ink-faint)',
  archived: 'var(--ink-faint)',
};

function StatusBadge({ label, colour }: { label: string; colour: string }) {
  return (
    <span className="badge" style={{
      color: colour, borderColor: colour, background: 'var(--surface)', fontWeight: 600,
      fontSize: 13, border: '1px solid', padding: '6px 14px',
    }}>
      {label}
    </span>
  );
}

function EquipmentView({ fields }: { fields: Record<string, unknown> }) {
  const status = fields.status as HsEquipmentStatus;
  const known = (Object.keys(HS_EQUIPMENT_STATUS_LABELS) as HsEquipmentStatus[]).includes(status);
  const label = known ? HS_EQUIPMENT_STATUS_LABELS[status] : String(status);
  const colour = known ? EQUIPMENT_COLOUR[status] : 'var(--ink-faint)';

  return (
    <>
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-xl" style={{ color: '#0A0F1E' }}>{String(fields.name ?? 'Asset')}</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {fields.asset_ref ? String(fields.asset_ref) : null}
          {fields.asset_ref && fields.company_name ? ' · ' : null}
          {fields.company_name ? String(fields.company_name) : null}
        </p>
        {fields.site_name ? <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{String(fields.site_name)}</p> : null}
      </div>
      <div className="text-center"><StatusBadge label={label} colour={colour} /></div>
      {fields.next_inspection_due ? (
        <p className="text-sm text-center" style={{ color: 'var(--ink-soft)' }}>
          Next inspection due {String(fields.next_inspection_due)}
        </p>
      ) : null}
    </>
  );
}

function CoshhView({ fields }: { fields: Record<string, unknown> }) {
  const status = fields.status as DocStatus;
  const known = (Object.keys(DOC_STATUS_LABELS) as DocStatus[]).includes(status);
  const label = known ? DOC_STATUS_LABELS[status] : String(status);
  const colour = (known && DOC_COLOUR[status]) || 'var(--ink-faint)';

  return (
    <>
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-xl" style={{ color: '#0A0F1E' }}>{String(fields.title ?? 'COSHH assessment')}</h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {fields.substance_name ? String(fields.substance_name) : null}
          {fields.substance_name && fields.company_name ? ' · ' : null}
          {fields.company_name ? String(fields.company_name) : null}
        </p>
      </div>
      <div className="text-center"><StatusBadge label={label} colour={colour} /></div>
      {fields.review_date ? (
        <p className="text-sm text-center" style={{ color: 'var(--ink-soft)' }}>
          Review due {String(fields.review_date)}
        </p>
      ) : null}
    </>
  );
}

export default function EntityScanView({
  token, entityType, fields,
}: {
  token: string;
  entityType: 'equipment' | 'coshh_assessment';
  fields: Record<string, unknown>;
}) {
  const [reporting, setReporting] = useState(false);

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[420px] rounded-[20px] p-8 space-y-4" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        {entityType === 'equipment' ? <EquipmentView fields={fields} /> : <CoshhView fields={fields} />}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {reporting ? (
            <EntityReportForm token={token} onDone={() => setReporting(false)} />
          ) : (
            <button type="button" className="btn-secondary w-full" style={{ minHeight: 44 }} onClick={() => setReporting(true)}>
              <ShieldAlert size={14} /> Report an issue with this
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
