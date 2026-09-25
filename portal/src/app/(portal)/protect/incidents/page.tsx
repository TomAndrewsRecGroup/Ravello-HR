import type { Metadata } from 'next';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_STATUS_LABELS, HS_INCIDENT_TYPE_LABELS, type HsIncidentSeverity } from '@/lib/hs/vocab';
import type { HsIncident } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SEVERITY_COLOUR: Record<HsIncidentSeverity, string> = {
  minor: 'var(--ink-faint)', significant: 'var(--gold)', major: 'var(--red)', fatal: 'var(--red)',
};

// This is the client's own legal RIDDOR record-keeping duty — Core OS
// 360 maintains it on their behalf, read-only: nothing here is
// self-certified, same posture as the Register and Audits.
export default async function ProtectIncidentsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: incidents, error } = await supabase
    .from('hs_incidents')
    .select('id, incident_type, occurred_on, description, severity, riddor_reportable, riddor_reported_on, status')
    .eq('company_id', companyId)
    .order('occurred_on', { ascending: false })
    .limit(200);

  const rows = (incidents ?? []) as HsIncident[];

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Incidents could not be loaded. Refresh to try again.</p>}
      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ShieldAlert size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No incidents recorded</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
              Core OS 360 keeps your RIDDOR incident log here on your behalf.
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(inc => (
            <li key={inc.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="badge">{HS_INCIDENT_TYPE_LABELS[inc.incident_type]}</span>
                <strong style={{ color: SEVERITY_COLOUR[inc.severity] }}>{HS_INCIDENT_SEVERITY_LABELS[inc.severity]}</strong>
                {inc.riddor_reportable && (
                  <span className="badge flex items-center gap-1" style={{ background: 'rgba(217,68,68,0.12)', color: 'var(--red)' }}>
                    <AlertTriangle size={11} /> RIDDOR{inc.riddor_reported_on ? ` · reported ${fmt(inc.riddor_reported_on)}` : ''}
                  </span>
                )}
                <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(inc.occurred_on)}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{inc.description}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Status: {HS_INCIDENT_STATUS_LABELS[inc.status]}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
