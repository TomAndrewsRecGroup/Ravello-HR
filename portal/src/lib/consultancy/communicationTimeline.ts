// Core-OS 360 Phase 6, section 11: the Communication Timeline.
//
// "Bring together email log, Broadcast history, service-request
// replies, support tickets and report issue history. Preserve
// visibility classes: internal consultancy, shared with client,
// client-originated." (Phase 6 spec §11)
//
// "support tickets" here means `service_requests` — per this repo's
// own standing history (see CLAUDE.md, "Support & BD in sync"), the
// `tickets`/`ticket_messages` tables never had a writer and were
// removed; `service_requests` has been THE support object since
// migration 101.
//
// Pure aggregator, no I/O — the caller (Client 360) reads each of the
// source tables (already company-scoped, via the service role, the
// same pattern every other query on that page already uses) and this
// function only merges and classifies. Nothing here computes a fact;
// it labels facts already recorded elsewhere.
//
// Visibility classification, and why:
//   - client_originated:   the client raised it — a service request
//                           at the moment it was created.
//   - shared_with_client:  the consultancy sent it to the client, or
//                           it is otherwise visible on the client's
//                           own portal — an outbound email (email_log
//                           only ever records mail actually sent to a
//                           company/candidate/athlete contact, never an
//                           internal staff notification, which goes
//                           through notify() instead), a Broadcast
//                           action (visible on the client's own
//                           /actions page the instant it is created),
//                           a service request's staff response, an
//                           issued value report, or an issued VISIT
//                           report (Phase 24, Group 5 — a draft visit
//                           report is never in this timeline at all;
//                           only `status = 'issued'` rows are ever
//                           passed in, so this file needs no status
//                           check of its own).
//   - internal_consultancy: a 'manual' consultancy_service_ledger
//                           entry — the one entry_type with no
//                           source_type/source_id (see migration 169's
//                           own comment: "NULL source_type/source_id
//                           ... allowing unlimited manual notes"), i.e.
//                           a note a consultant wrote for their own
//                           record that was never itself communicated
//                           to anyone. Every other ledger entry_type
//                           traces back to something already covered
//                           by one of the kinds above.

export type CommunicationVisibility = 'client_originated' | 'shared_with_client' | 'internal_consultancy';
export type CommunicationKind =
  | 'email' | 'broadcast' | 'service_request_raised' | 'service_request_responded' | 'report_issued'
  | 'visit_report_issued' | 'consultant_note';

export interface CommunicationTimelineEntry {
  id: string;
  occurredAt: string;
  kind: CommunicationKind;
  visibility: CommunicationVisibility;
  summary: string;
}

export interface EmailLogRow {
  id: string;
  subject: string;
  to_email: string;
  sent_at: string;
}

export interface BroadcastActionRow {
  id: string;
  title: string;
  created_at: string;
}

export interface ServiceRequestRow {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export interface ReportIssuedRow {
  id: string;
  title: string;
  period: string | null;
  created_at: string;
}

export interface ManualLedgerNoteRow {
  id: string;
  summary: string;
  occurred_at: string;
}

// Core-OS 360 Completion Programme, Phase 24, Group 5 (closes gap-ledger
// row C6.15 — "visit reports as a Communication Timeline source"). A
// visit report (Phase 7, migration 176) is a genuinely different thing
// from a value report (ReportIssuedRow above, the `reports` table) —
// this is the site-visit summary/recommendations a consultant writes,
// distributed to the client only once `status = 'issued'`. `issued_at`
// is the event date, never `created_at` — a report can sit in `draft`
// for days before it is ever shared, and only the issue itself is a
// communication event.
export interface VisitReportIssuedRow {
  id: string;
  version: number;
  issued_at: string;
}

export interface CommunicationTimelineInputs {
  emails: EmailLogRow[];
  broadcasts: BroadcastActionRow[];
  serviceRequests: ServiceRequestRow[];
  reports: ReportIssuedRow[];
  visitReports: VisitReportIssuedRow[];
  manualLedgerNotes: ManualLedgerNoteRow[];
}

export function buildCommunicationTimeline(inputs: CommunicationTimelineInputs): CommunicationTimelineEntry[] {
  const entries: CommunicationTimelineEntry[] = [];

  for (const e of inputs.emails) {
    entries.push({
      id: `email:${e.id}`,
      occurredAt: e.sent_at,
      kind: 'email',
      visibility: 'shared_with_client',
      summary: `Email sent: "${e.subject}" to ${e.to_email}`,
    });
  }

  for (const b of inputs.broadcasts) {
    entries.push({
      id: `broadcast:${b.id}`,
      occurredAt: b.created_at,
      kind: 'broadcast',
      visibility: 'shared_with_client',
      summary: `Broadcast action: "${b.title}"`,
    });
  }

  for (const sr of inputs.serviceRequests) {
    entries.push({
      id: `sr-raised:${sr.id}`,
      occurredAt: sr.created_at,
      kind: 'service_request_raised',
      visibility: 'client_originated',
      summary: `Client raised: "${sr.subject}"`,
    });
    // A request may exist with no response yet — responded_at is the
    // one fact that decides whether a second, distinct event exists.
    if (sr.responded_at) {
      entries.push({
        id: `sr-responded:${sr.id}`,
        occurredAt: sr.responded_at,
        kind: 'service_request_responded',
        visibility: 'shared_with_client',
        summary: `Responded to: "${sr.subject}"`,
      });
    }
  }

  for (const r of inputs.reports) {
    entries.push({
      id: `report:${r.id}`,
      occurredAt: r.created_at,
      kind: 'report_issued',
      visibility: 'shared_with_client',
      summary: `Report issued: "${r.title}"${r.period ? ` (${r.period})` : ''}`,
    });
  }

  for (const vr of inputs.visitReports) {
    entries.push({
      id: `visit-report:${vr.id}`,
      occurredAt: vr.issued_at,
      kind: 'visit_report_issued',
      visibility: 'shared_with_client',
      summary: `Visit report issued (v${vr.version})`,
    });
  }

  for (const n of inputs.manualLedgerNotes) {
    entries.push({
      id: `note:${n.id}`,
      occurredAt: n.occurred_at,
      kind: 'consultant_note',
      visibility: 'internal_consultancy',
      summary: n.summary,
    });
  }

  return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
