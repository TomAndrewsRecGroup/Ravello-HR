// Row shapes for the H&S tables (migrations 094/095). The Supabase
// clients here are untyped, so these are what the pages agree on.

import type {
  HsActivityType, HsAuditRating, HsCompletionOutcome, HsEquipmentStatus,
  HsIncidentSeverity, HsIncidentStatus, HsIncidentType, HsRecurrenceUnit,
} from './vocab';

export interface HsRegisterItem {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  due_date: string | null;
  recurrence_every: number | null;
  recurrence_unit: HsRecurrenceUnit | null;
  last_completed_on: string | null;
  legal_basis: string | null;
  source: string;
  site_id: string | null;
}

export interface HsCompletion {
  id: string;
  item_id: string;
  completed_on: string;
  outcome: HsCompletionOutcome;
  notes: string | null;
  next_due_on: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsActivity {
  id: string;
  company_id: string;
  activity_type: HsActivityType;
  title: string;
  occurred_on: string;
  summary: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsEvent {
  id: number;
  occurred_at: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  summary: string;
  actor_kind: string;
}

export interface HsFile {
  id: string;
  entity_type: string;
  entity_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

export interface HsDocument {
  id: string;
  company_id: string;
  site_id: string | null;
  category: string;
  title: string;
  description: string | null;
  version: number;
  review_due_at: string | null;
  status: 'active' | 'superseded';
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HsSectorPackItem {
  id: string;
  pack_id: string;
  category: string;
  title: string;
  description: string | null;
  recurrence_every: number | null;
  recurrence_unit: HsRecurrenceUnit | null;
  legal_basis: string | null;
  sort_order: number;
}

export interface HsSectorPack {
  id: string;
  sector: string;
  name: string;
  description: string | null;
}

export interface HsAuditTemplate {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface HsAuditTemplateItem {
  id: string;
  template_id: string;
  category: string | null;
  prompt: string;
  guidance: string | null;
  sort_order: number;
}

export interface HsAudit {
  id: string;
  company_id: string;
  site_id: string | null;
  template_id: string | null;
  title: string;
  conducted_on: string;
  score: number | null;
  notes: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsAuditResponse {
  id: string;
  audit_id: string;
  company_id: string;
  template_item_id: string | null;
  prompt: string;
  category: string | null;
  rating: HsAuditRating;
  comment: string | null;
  sort_order: number;
  created_at: string;
}

export interface HsIncident {
  id: string;
  company_id: string;
  site_id: string | null;
  incident_type: HsIncidentType;
  occurred_on: string;
  injured_person_name: string | null;
  description: string;
  severity: HsIncidentSeverity;
  riddor_reportable: boolean;
  riddor_reported_on: string | null;
  immediate_action: string | null;
  status: HsIncidentStatus;
  recorded_by_kind: string;
  created_at: string;
  updated_at: string;
}

export interface HsEquipment {
  id: string;
  company_id: string;
  site_id: string | null;
  name: string;
  category: string | null;
  serial_number: string | null;
  status: HsEquipmentStatus;
  last_inspected_on: string | null;
  next_inspection_due: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HsActivityAttendee {
  id: string;
  activity_id: string;
  company_id: string;
  employee_id: string;
  created_at: string;
}
