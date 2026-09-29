import type { Consequence, Rule } from './rules';
import { changedTo, rowPayload, type PlatformEvent } from './types';

// Core-OS 360 Phase 6, Group 3 (migration 169): the Client Service
// Ledger (spec section 9). Its own file — spanning every module a
// consultancy might touch, the same "genuinely different content gets
// its own file" call environmentalRules.ts/legalRegisterRules.ts/
// governanceRules.ts already made for their own cross-pillar content.
//
// EVERY entry here is attributed by the EVENT'S OWN ACTOR, never by
// which client the row happens to belong to: the actor's home
// organisation must be a consultancy AND hold a LIVE relationship
// (consultancy_relationship_live, 168) to the event's own company_id.
// This is deliberate and narrow — Core OS 360 staff already have every
// other delivery record in this codebase (the value report, the
// governance KPIs, the admin dashboards); the Service Ledger's whole
// purpose is proving THIRD-PARTY consultancy value, so a staff-performed
// action is correctly never logged here.
//
// "Ledger entries should originate from real platform events... Do not
// fabricate monetary value or hours saved." Every summary line below
// is built only from factual row fields the event already carried.
//
// Idempotent by construction: the UNIQUE constraint on
// (consultancy_organisation_id, client_organisation_id, source_type,
// source_id) is the actual guard (168's own "the database is the
// boundary" rule) — ON CONFLICT DO NOTHING here is a courtesy that
// avoids a logged error on a re-processed event, not the safety net.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));

interface LedgerEntryInput {
  entryType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
}

function ledgerEntry(event: PlatformEvent, input: LedgerEntryInput): Consequence[] {
  if (!event.company_id || !event.actor_id) return [];
  return [{
    kind: 'run',
    label: `service ledger: ${input.entryType}`,
    fn: async (rsb) => {
      const { data: actorProfile } = await rsb.from('profiles').select('company_id').eq('id', event.actor_id).maybeSingle();
      const consultancyId = (actorProfile as { company_id?: string } | null)?.company_id;
      if (!consultancyId || consultancyId === event.company_id) return;

      const { data: actorCompany } = await rsb.from('companies').select('organisation_type').eq('id', consultancyId).maybeSingle();
      if ((actorCompany as { organisation_type?: string } | null)?.organisation_type !== 'consultancy') return;

      // Read organisation_relationships directly (mirroring
      // consultancy_relationship_live()'s own predicate) rather than an
      // RPC call — the database TRIGGER (168's own guard) is the real
      // enforcement for the tables that matter; this is a courtesy
      // check so an ended relationship stops generating new ledger
      // entries the moment it ends, not just new scope/visit rows.
      const { data: rels } = await rsb.from('organisation_relationships').select('status, valid_from, valid_until')
        .eq('source_organisation_id', consultancyId).eq('target_organisation_id', event.company_id)
        .eq('relationship_type', 'consultancy_client').eq('status', 'active');
      const today = new Date().toISOString().slice(0, 10);
      const live = ((rels ?? []) as { valid_from: string; valid_until: string | null }[])
        .some(r => r.valid_from <= today && (r.valid_until == null || r.valid_until >= today));
      if (!live) return;

      // upsert + ignoreDuplicates, not insert: the UNIQUE constraint
      // (168) is the real idempotency guard — this only avoids a
      // duplicate-key error being logged as a processing failure on a
      // re-processed event, the same "claim/ignoreDuplicates" shape
      // every other keyed write in this codebase already uses.
      await rsb.from('consultancy_service_ledger').upsert({
        consultancy_organisation_id: consultancyId,
        client_organisation_id: event.company_id,
        entry_type: input.entryType,
        summary: input.summary,
        source_type: input.sourceType,
        source_id: input.sourceId,
      }, { onConflict: 'consultancy_organisation_id,client_organisation_id,source_type,source_id', ignoreDuplicates: true });
    },
  }];
}

export const serviceLedgerRules: Rule[] = [
  {
    id: 'ledger_visit_completed',
    on: 'consultancy_visits.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['completed']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'visit', sourceType: 'consultancy_visits', sourceId: event.entity_id,
        summary: `Consultant visit completed (${s(n.visit_type, 'visit')})`,
      });
    },
  },
  {
    id: 'ledger_audit_recorded',
    on: 'hs_audits.created',
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'audit', sourceType: 'hs_audits', sourceId: event.entity_id,
        summary: `Audit recorded: ${s(n.title, 'Untitled audit')}`,
      });
    },
  },
  {
    id: 'ledger_document_published',
    on: 'hs_documents.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['active']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'document', sourceType: 'hs_documents', sourceId: event.entity_id,
        summary: `Document published: ${s(n.title, 'Untitled document')}`,
      });
    },
  },
  {
    id: 'ledger_report_generated',
    on: 'reports.created',
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'report', sourceType: 'reports', sourceId: event.entity_id,
        summary: `Report generated: ${s(n.title, s(n.period, 'Report'))}`,
      });
    },
  },
  {
    id: 'ledger_service_request_resolved',
    on: 'service_requests.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['complete']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'service_request_resolved', sourceType: 'service_requests', sourceId: event.entity_id,
        summary: `Service request resolved: ${s(n.subject, 'Untitled request')}`,
      });
    },
  },
  {
    // A Broadcast-originated action closed still logs as 'action_closed'
    // via this same rule — 'broadcast' below is the SEND moment, this
    // is the DELIVERY moment; both are real, distinct value.
    id: 'ledger_action_closed',
    on: 'actions.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['complete']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'action_closed', sourceType: 'actions', sourceId: event.entity_id,
        summary: `Action closed: ${s(n.title, 'Untitled action')}`,
      });
    },
  },
  {
    id: 'ledger_broadcast_sent',
    on: 'actions.created',
    when: (e: PlatformEvent) => rowPayload(e).new.created_by_admin === true,
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'broadcast', sourceType: 'actions', sourceId: event.entity_id,
        summary: `Broadcast: ${s(n.title, 'Untitled action')}`,
      });
    },
  },
  {
    id: 'ledger_training_delivered',
    on: 'training_records.created',
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'training', sourceType: 'training_records', sourceId: event.entity_id,
        summary: `Training recorded: ${s(n.course_name, 'Untitled course')}`,
      });
    },
  },
  {
    id: 'ledger_incident_support',
    on: 'hs_incidents.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['closed']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      const { new: n } = rowPayload(event);
      return ledgerEntry(event, {
        entryType: 'incident_support', sourceType: 'hs_incidents', sourceId: event.entity_id,
        summary: `Incident investigation closed (${s(n.incident_type, 'incident')})`,
      });
    },
  },
  {
    id: 'ledger_management_review_support',
    on: 'management_reviews.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['completed']),
    then: ({ event }) => {
      if (!event.entity_id) return [];
      return ledgerEntry(event, {
        entryType: 'management_review_support', sourceType: 'management_reviews', sourceId: event.entity_id,
        summary: 'Management review support provided',
      });
    },
  },
];
