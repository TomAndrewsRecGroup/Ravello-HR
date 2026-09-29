import type { Metadata } from 'next';
import { Leaf, ShieldAlert } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import {
  ENVIRONMENTAL_ASPECT_TYPE_LABELS, ENVIRONMENTAL_ASPECT_CONDITION_LABELS, ENVIRONMENTAL_ASPECT_STATUS_LABELS,
  type EnvironmentalAspectStatus,
} from '@/lib/hs/vocab';
import type { EnvironmentalAspect, EnvironmentalAspectAssessment } from '@/lib/hs/types';

export const metadata: Metadata = { title: 'Environmental Aspects' };
export const dynamic = 'force-dynamic';

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOUR: Record<EnvironmentalAspectStatus, string> = {
  draft: 'var(--ink-faint)',
  assessed: 'var(--blue)',
  confirmed_significant: 'var(--red)',
  confirmed_not_significant: 'var(--teal)',
  superseded: 'var(--ink-faint)',
};

// Read-only: Core OS 360 maintains a client's environmental aspects &
// impacts register on their behalf, the same posture as Register /
// Documents / Audits / Equipment / Emergency Plans — nothing here is
// self-certified. Active (non-superseded) aspects only; version history
// (a material change is a new row, never an edit) lives with staff.
// Significance is never computed by AI here or anywhere in this
// subsystem: what is shown is the deterministic likelihood x severity
// x frequency score plus who confirmed it and when.
export default async function ProtectEnvironmentalAspectsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const { data: aspects, error: aspectsError } = await supabase.from('environmental_aspects')
    .select('id, company_id, site_id, activity, aspect_type, condition, description, version, status, supersedes_id, created_by, created_at, updated_at')
    .eq('company_id', companyId).neq('status', 'superseded').order('activity').limit(500);
  const rows = (aspects ?? []) as EnvironmentalAspect[];
  const aspectIds = rows.map(a => a.id);

  const { data: assessments, error: assessError } = aspectIds.length > 0
    ? await supabase.from('environmental_aspect_assessments')
        .select('id, aspect_id, company_id, likelihood, severity, frequency, computed_score, significance_threshold_used, is_significant, confirmed_by, confirmed_at, methodology_notes, created_at')
        .in('aspect_id', aspectIds).order('created_at', { ascending: false }).limit(500)
    : { data: [] as EnvironmentalAspectAssessment[], error: null };

  const error = aspectsError ?? assessError ?? null;
  const assessRows = (assessments ?? []) as EnvironmentalAspectAssessment[];
  const latestAssessment = (aspectId: string) => assessRows.find(a => a.aspect_id === aspectId) ?? null;

  return (
    <main className="portal-page flex-1 space-y-4">
      {error && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Environmental aspects could not be loaded. Refresh to try again.</p>}

      {rows.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <Leaf size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No environmental aspects on file yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(aspect => {
            const assessment = latestAssessment(aspect.id);
            return (
              <div key={aspect.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <strong style={{ color: 'var(--ink)' }}>{aspect.activity}</strong>
                  <span className="badge">{ENVIRONMENTAL_ASPECT_TYPE_LABELS[aspect.aspect_type]}</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{ENVIRONMENTAL_ASPECT_CONDITION_LABELS[aspect.condition]}</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>v{aspect.version}</span>
                  <span className="ml-auto text-sm font-medium" style={{ color: STATUS_COLOUR[aspect.status] }}>
                    {aspect.status === 'confirmed_significant' && <ShieldAlert size={12} className="inline mr-1" />}
                    {ENVIRONMENTAL_ASPECT_STATUS_LABELS[aspect.status]}
                  </span>
                </div>
                {aspect.description && (
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{aspect.description}</p>
                )}
                {assessment && (
                  <div className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-soft)' }}>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>Likelihood: <strong>{assessment.likelihood}</strong></span>
                      <span>Severity: <strong>{assessment.severity}</strong></span>
                      <span>Frequency: <strong>{assessment.frequency}</strong></span>
                      <span>Score: <strong>{assessment.computed_score}</strong> / threshold {assessment.significance_threshold_used}</span>
                    </div>
                    {assessment.confirmed_at && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
                        Confirmed {fmt(assessment.confirmed_at)}
                      </p>
                    )}
                    {assessment.methodology_notes && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>{assessment.methodology_notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
