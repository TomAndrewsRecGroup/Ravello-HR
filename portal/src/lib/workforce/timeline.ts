// Person Timeline (go-live gap list, item 1, 2026-10-02).
//
// Pure composition over the EXIST rows the person profile already
// fetches in loadProfile.ts — training, competency, credential,
// induction, authorisation, PPE, pre-employment, development,
// deployment-status-log and safety (incident) rows are all already
// per-person reads under the viewer's own RLS session. This file
// invents no new query and no new table: it only UNIONs what is
// already loaded into one chronological feed, the same "pure
// composition, no second source of the same fact" discipline every
// cross-cutting dashboard in this codebase already follows
// (lib/complianceTwin/assemble.ts, lib/core360Status/assemble.ts).
//
// Deliberately distinct from the per-COMPANY Safety Timeline
// (hs_events) and the per-client admin "What Changed" feature
// (lib/whatChanged/compute.ts) — this is scoped to ONE PERSON, reusing
// data the profile already has permission to show, never a new RLS
// surface.

import type {
  AuthorisationRow, AuthSuspensionRow, CompetencyRow, CredentialRow, DevelopmentRow, CheckRow,
  InductionCompletionRow, PpeRow, SuspensionRow, TrainingRow,
} from '@/app/(portal)/lead/workforce/people/[id]/rows';
import type { StatusLogRow } from './profile';

export type TimelineCategory =
  | 'training' | 'competency' | 'credential' | 'induction' | 'authorisation'
  | 'ppe' | 'pre_employment' | 'development' | 'status' | 'incident' | 'suspension';

export interface TimelineEvent {
  date: string;
  category: TimelineCategory;
  label: string;
  detail?: string;
}

export interface TimelineInput {
  training: readonly TrainingRow[];
  competencies: readonly CompetencyRow[];
  credentials: readonly CredentialRow[];
  inductionCompletions: readonly InductionCompletionRow[];
  authorisations: readonly AuthorisationRow[];
  authSuspensions: readonly AuthSuspensionRow[];
  suspensions: readonly SuspensionRow[];
  ppe: readonly PpeRow[];
  checks: readonly CheckRow[];
  development: readonly DevelopmentRow[];
  log: readonly StatusLogRow[];
  incidents: readonly { id: string; incident_number: string | null; status: string; occurred_on: string | null; incident_type: string | null }[];
}

export interface TimelineNames {
  courses: Record<string, string>;
  competencies: Record<string, string>;
  credentialTypes: Record<string, string>;
  inductions: Record<string, string>;
  authTypes: Record<string, string>;
  ppeTypes: Record<string, string>;
  checkTypes: Record<string, string>;
}

const statusLabel = (s: string | null, labels: Record<string, string>) =>
  s == null ? 'Not calculated' : (labels[s] ?? s);

/** Every event this person's own data already carries, newest first.
 *  Nothing here decides anything new — it only dates, labels and
 *  orders rows the caller already fetched under its own RLS session. */
export function buildPersonTimeline(
  data: TimelineInput,
  names: TimelineNames,
  deploymentStatusLabels: Record<string, string>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const t of data.training) {
    events.push({
      date: t.completed_on, category: 'training',
      label: `Training completed: ${t.course_id ? (names.courses[t.course_id] ?? t.course_name) : t.course_name}`,
      detail: t.result !== 'pass' ? `Result: ${t.result}` : undefined,
    });
  }
  for (const c of data.competencies) {
    events.push({
      date: c.assessed_on, category: 'competency',
      label: `Competency assessed: ${names.competencies[c.competency_id] ?? 'Competency'}`,
    });
  }
  for (const s of data.suspensions) {
    events.push({ date: s.suspended_at, category: 'suspension', label: `Competency suspended: ${names.competencies[s.competency_id] ?? 'Competency'}`, detail: s.reason });
    if (s.lifted_at) events.push({ date: s.lifted_at, category: 'suspension', label: `Competency suspension lifted: ${names.competencies[s.competency_id] ?? 'Competency'}` });
  }
  for (const c of data.credentials) {
    if (c.issued_on) events.push({
      date: c.issued_on, category: 'credential',
      label: `Qualification/licence recorded: ${names.credentialTypes[c.credential_type_id] ?? 'Credential'}`,
    });
  }
  for (const i of data.inductionCompletions) {
    events.push({
      date: i.completed_on, category: 'induction',
      label: `Induction completed: ${names.inductions[i.induction_template_id] ?? 'Induction'}`,
    });
  }
  for (const a of data.authorisations) {
    events.push({ date: a.issued_on, category: 'authorisation', label: `Authorisation issued: ${names.authTypes[a.authorisation_type_id] ?? 'Authorisation'}` });
    if (a.revoked_at) events.push({ date: a.revoked_at, category: 'authorisation', label: `Authorisation revoked: ${names.authTypes[a.authorisation_type_id] ?? 'Authorisation'}`, detail: a.revoke_reason ?? undefined });
  }
  for (const s of data.authSuspensions) {
    events.push({ date: s.suspended_at, category: 'suspension', label: 'Authorisation suspended', detail: s.reason });
    if (s.lifted_at) events.push({ date: s.lifted_at, category: 'suspension', label: 'Authorisation suspension lifted' });
  }
  for (const p of data.ppe) {
    events.push({ date: p.issued_on, category: 'ppe', label: `PPE issued: ${names.ppeTypes[p.ppe_type_id] ?? 'PPE'}` });
    if (p.returned_on) events.push({ date: p.returned_on, category: 'ppe', label: `PPE returned: ${names.ppeTypes[p.ppe_type_id] ?? 'PPE'}` });
  }
  for (const c of data.checks) {
    if (c.received_on) events.push({
      date: c.received_on, category: 'pre_employment',
      label: `Pre-employment check received: ${names.checkTypes[c.check_type_id] ?? 'Check'}`,
      detail: c.status !== 'cleared' ? `Status: ${c.status}` : undefined,
    });
  }
  for (const d of data.development) {
    events.push({ date: d.created_at, category: 'development', label: `Development item raised: ${d.title}` });
  }
  for (const l of data.log) {
    events.push({
      date: l.changed_at, category: 'status',
      label: `Safe to Deploy status changed: ${statusLabel(l.from_status, deploymentStatusLabels)} → ${statusLabel(l.to_status, deploymentStatusLabels)}`,
    });
  }
  for (const i of data.incidents) {
    if (i.occurred_on) events.push({
      date: i.occurred_on, category: 'incident',
      label: `Named on incident: ${i.incident_number ?? i.incident_type ?? 'Incident'}`,
      detail: i.status.replace(/_/g, ' '),
    });
  }

  return events
    .filter(e => !!e.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  training: 'Training',
  competency: 'Competency',
  credential: 'Qualification/licence',
  induction: 'Induction',
  authorisation: 'Authorisation',
  ppe: 'PPE',
  pre_employment: 'Pre-employment',
  development: 'Development',
  status: 'Safe to Deploy',
  incident: 'Safety',
  suspension: 'Suspension',
};
