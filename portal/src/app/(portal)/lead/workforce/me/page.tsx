import type { Metadata } from 'next';
import { getWorkforceContext } from '@/lib/workforce/context';
import { fmtDate, fmtDateTime, todayIso } from '@/lib/hs/safetyContext';
import {
  DEPLOYMENT_STATUS_LABELS, HEALTH_OUTCOME_LABELS, REQUIREMENT_TYPE_LABELS, VERIFICATION_LABELS,
  type DeploymentStatus, type HealthOutcome, type VerificationStatus,
} from '@/lib/workforce/vocab';
import type { DeploymentResult } from '@/lib/workforce/types';
import { DeploymentBadge, RequirementBadge } from '@/components/workforce/DeploymentBadge';
import Pill, { type Tone } from '@/components/safety/Pill';
import MeForms from './MeForms';

export const metadata: Metadata = { title: 'My compliance' };
export const dynamic = 'force-dynamic';

const VERIFY_TONE: Record<VerificationStatus, Tone> = { unverified: 'warn', verified: 'good', rejected: 'bad' };

// Employee self-service (spec 79, 80, 120). Everything here is the
// signed-in person's OWN record (my_person_id), read under their own
// session: no colleague, no manager note, no clinical detail. An
// occupational health outcome shows its category and dates only.
// Evidence they add is always stored unverified (134 guard) and counts
// only once someone else verifies it.
export default async function MyCompliancePage() {
  const ctx = await getWorkforceContext();
  const { supabase, companyId, myPersonId: me } = ctx;
  if (!companyId) return <main className="portal-page flex-1"><p className="card p-4 text-sm">No organisation is selected.</p></main>;
  if (!me) {
    return (
      <main className="portal-page flex-1">
        <div className="card p-5 text-sm space-y-1">
          <p className="font-medium" style={{ color: 'var(--ink)' }}>Your login is not linked to a worker record here.</p>
          <p style={{ color: 'var(--ink-soft)' }}>Ask your administrator to link your account to your worker record, then your training, certificates and Safe to Deploy status will appear on this page.</p>
        </div>
      </main>
    );
  }

  const [status, training, creds, indAssign, indDone, dev, health, credTypes, courses, templates, ohReqs] = await Promise.all([
    supabase.rpc('person_deployment_status', { p_person: me }),
    supabase.from('training_records')
      .select('id, course_name, completed_on, expires_on, result, verification_status, rejection_reason, source')
      .eq('person_id', me).order('completed_on', { ascending: false }).limit(300),
    supabase.from('person_credentials')
      .select('id, credential_type_id, credential_number, awarding_body, issued_on, expires_on, verification_status, rejection_reason, source')
      .eq('person_id', me).order('created_at', { ascending: false }).limit(300),
    supabase.from('induction_assignments').select('id, induction_template_id, assigned_on, required_before, status')
      .eq('person_id', me).order('assigned_on', { ascending: false }).limit(200),
    supabase.from('induction_completions').select('id, induction_template_id, completed_on, reinduction_due')
      .eq('person_id', me).order('completed_on', { ascending: false }).limit(200),
    supabase.from('development_items').select('id, title, status, due_date')
      .eq('person_id', me).order('created_at', { ascending: false }).limit(200),
    // Category and dates only — never restriction text or anything clinical.
    supabase.from('person_health_outcomes').select('id, requirement_id, assessed_on, outcome, review_date')
      .eq('person_id', me).order('assessed_on', { ascending: false }).limit(100),
    supabase.from('credential_types').select('id, title, kind, active_status').order('title').limit(500),
    supabase.from('training_courses').select('id, title').eq('active_status', 'active').order('title').limit(500),
    supabase.from('induction_templates').select('id, title').limit(500),
    supabase.from('occupational_health_requirements').select('id, title').limit(500),
  ]);

  const res = status.data as DeploymentResult | null;
  const today = todayIso();
  const credName = new Map((credTypes.data ?? []).map(c => [c.id as string, c.title as string]));
  const tplName = new Map((templates.data ?? []).map(t => [t.id as string, t.title as string]));
  const ohName = new Map((ohReqs.data ?? []).map(t => [t.id as string, t.title as string]));
  const expiry = (d: string | null) => d
    ? <>{fmtDate(d)}{d < today && <span style={{ color: 'var(--red)' }}> (expired)</span>}</>
    : 'No expiry';
  const loadError = [training, creds, indAssign, indDone, dev].find(r => r.error)?.error;
  const st = (res?.status && res.status in DEPLOYMENT_STATUS_LABELS ? res.status : 'REVIEW_REQUIRED') as DeploymentStatus;

  return (
    <main className="portal-page flex-1 space-y-4 max-w-4xl">
      <section className="card p-5 space-y-3" aria-labelledby="me-status">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="me-status" className="font-semibold font-display" style={{ color: 'var(--ink)' }}>My Safe to Deploy status</h2>
          {res && <DeploymentBadge status={st} />}
        </div>
        {status.error ? (
          <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>Your status could not be loaded: {status.error.message}</p>
        ) : res && (
          <>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Calculated {fmtDateTime(res.computed_at)}</p>
            {res.reasons.length > 0 ? (
              <ul className="text-sm space-y-1 list-disc pl-5" style={{ color: 'var(--ink-soft)' }}>
                {res.reasons.map((r, i) => <li key={i}>{r.text}</li>)}
              </ul>
            ) : st === 'READY' && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Every requirement for your role is met.</p>}
          </>
        )}
      </section>

      {res && res.requirements.length > 0 && (
        <section className="space-y-2" aria-labelledby="me-reqs">
          <h2 id="me-reqs" className="font-semibold" style={{ color: 'var(--ink)' }}>What your role needs</h2>
          <ul className="space-y-2">
            {res.requirements.map((r, i) => (
              <li key={`${r.type}-${r.reference_id ?? r.reference_key}-${i}`} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {r.name ?? REQUIREMENT_TYPE_LABELS[r.type]}{r.safety_critical && <span style={{ color: 'var(--red)' }}> · Safety-critical</span>}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {REQUIREMENT_TYPE_LABELS[r.type] ?? r.type}
                    {r.expires_on && <> · Expires {fmtDate(r.expires_on)}</>}
                    {r.detail && <> · {r.detail}</>}
                  </p>
                </div>
                <RequirementBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {loadError && <p className="card p-3 text-sm" role="alert" style={{ color: 'var(--red)' }}>Some of your records could not be loaded: {loadError.message}</p>}

      <MeForms companyId={companyId} personId={me}
        credentialTypes={(credTypes.data ?? []).filter(c => c.active_status === 'active').map(c => ({ id: c.id as string, title: c.title as string, kind: c.kind as string }))}
        courses={(courses.data ?? []).map(c => ({ id: c.id as string, title: c.title as string }))} />

      <section className="space-y-2" aria-labelledby="me-training">
        <h2 id="me-training" className="font-semibold" style={{ color: 'var(--ink)' }}>My training</h2>
        {(training.data ?? []).length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>No training recorded yet. Use “Record training I completed” above to add one.</p>
        ) : (
          <ul className="space-y-2">
            {(training.data ?? []).map(t => (
              <li key={t.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t.course_name as string}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    Completed {fmtDate(t.completed_on as string)} · Expires {expiry(t.expires_on as string | null)}
                    {t.source === 'self' && ' · Added by you'}
                  </p>
                  {t.verification_status === 'rejected' && t.rejection_reason && (
                    <p className="text-xs" style={{ color: 'var(--red)' }}>Rejected: {t.rejection_reason as string}</p>
                  )}
                </div>
                <Pill tone={VERIFY_TONE[t.verification_status as VerificationStatus] ?? 'neutral'}>
                  {VERIFICATION_LABELS[t.verification_status as VerificationStatus] ?? String(t.verification_status)}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="me-creds">
        <h2 id="me-creds" className="font-semibold" style={{ color: 'var(--ink)' }}>My licences, cards and certificates</h2>
        {(creds.data ?? []).length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing on file yet. Use “Upload a certificate” above.</p>
        ) : (
          <ul className="space-y-2">
            {(creds.data ?? []).map(c => (
              <li key={c.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{credName.get(c.credential_type_id as string) ?? 'Credential'}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {c.credential_number && <>No. {c.credential_number as string} · </>}
                    {c.issued_on && <>Issued {fmtDate(c.issued_on as string)} · </>}
                    Expires {expiry(c.expires_on as string | null)}
                  </p>
                  {c.verification_status === 'rejected' && c.rejection_reason && (
                    <p className="text-xs" style={{ color: 'var(--red)' }}>Rejected: {c.rejection_reason as string}</p>
                  )}
                </div>
                <Pill tone={VERIFY_TONE[c.verification_status as VerificationStatus] ?? 'neutral'}>
                  {VERIFICATION_LABELS[c.verification_status as VerificationStatus] ?? String(c.verification_status)}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="me-inductions">
        <h2 id="me-inductions" className="font-semibold" style={{ color: 'var(--ink)' }}>My inductions</h2>
        {(indAssign.data ?? []).length === 0 && (indDone.data ?? []).length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>No inductions assigned to you.</p>
        ) : (
          <ul className="space-y-2">
            {(indAssign.data ?? []).filter(a => a.status === 'assigned').map(a => (
              <li key={a.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{tplName.get(a.induction_template_id as string) ?? 'Induction'}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    Assigned {fmtDate(a.assigned_on as string)}{a.required_before && <> · Required before {fmtDate(a.required_before as string)}</>}
                  </p>
                </div>
                <Pill tone="warn">To do</Pill>
              </li>
            ))}
            {(indDone.data ?? []).map(c => (
              <li key={c.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{tplName.get(c.induction_template_id as string) ?? 'Induction'}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    Completed {fmtDate(c.completed_on as string)}{c.reinduction_due && <> · Re-induction due {fmtDate(c.reinduction_due as string)}</>}
                  </p>
                </div>
                <Pill tone="good">Completed</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(health.data ?? []).length > 0 && (
        <section className="space-y-2" aria-labelledby="me-health">
          <h2 id="me-health" className="font-semibold" style={{ color: 'var(--ink)' }}>My occupational health reviews</h2>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>The outcome and dates only. Any clinical detail stays with the occupational health provider.</p>
          <ul className="space-y-2">
            {(health.data ?? []).map(h => (
              <li key={h.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{h.requirement_id ? ohName.get(h.requirement_id as string) ?? 'Health review' : 'Health review'}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    Assessed {fmtDate(h.assessed_on as string)}{h.review_date && <> · Next review {fmtDate(h.review_date as string)}</>}
                  </p>
                </div>
                <Pill tone="neutral">{HEALTH_OUTCOME_LABELS[h.outcome as HealthOutcome] ?? String(h.outcome)}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="me-dev">
        <h2 id="me-dev" className="font-semibold" style={{ color: 'var(--ink)' }}>My development</h2>
        {(dev.data ?? []).length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>No development items yet.</p>
        ) : (
          <ul className="space-y-2">
            {(dev.data ?? []).map(d => (
              <li key={d.id as string} className="card p-3 flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{d.title as string}</p>
                  {d.due_date && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Due {fmtDate(d.due_date as string)}</p>}
                </div>
                <Pill tone={d.status === 'done' ? 'good' : d.status === 'cancelled' ? 'muted' : 'info'}>
                  {({ open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' } as Record<string, string>)[d.status as string] ?? String(d.status)}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
