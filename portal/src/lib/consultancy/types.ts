// Core-OS 360 Phase 6 row shapes. Shared-dupe pair with portal
// (scripts/check-shared-dupes.sh).

import type {
  ObservationSeverity, ObservationType,
  ReviewFrequency, ServiceLedgerEntryType, ServiceScopeStatus, ServiceType,
  VisitStatus, VisitTemplateCategory, VisitType,
} from './vocab';

export interface ConsultancyServiceScope {
  id: string;
  consultancy_organisation_id: string;
  client_organisation_id: string;
  service_type: ServiceType;
  status: ServiceScopeStatus;
  start_date: string;
  end_date: string | null;
  service_owner_person_id: string | null;
  included_scope: string | null;
  excluded_scope: string | null;
  review_frequency: ReviewFrequency | null;
  commercial_reference: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultancyVisit {
  id: string;
  consultancy_organisation_id: string;
  client_organisation_id: string;
  site_id: string | null;
  consultant_person_id: string | null;
  visit_type: VisitType;
  scheduled_date: string;
  status: VisitStatus;
  notes: string | null;
  // Core-OS 360 Phase 7, Group 1 (migration 173) — additive.
  previous_visit_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  scope: string | null;
  client_attendees: string[] | null;
  internal_notes: string | null;
  shared_summary: string | null;
  template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultancyVisitTemplate {
  id: string;
  consultancy_organisation_id: string;
  name: string;
  category: VisitTemplateCategory;
  version: number;
  is_active: boolean;
  supersedes_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ConsultancyVisitTemplateItem {
  id: string;
  template_id: string;
  section: string;
  question: string;
  expects_evidence: boolean;
  sort_order: number;
}

export interface ConsultancyServiceLedgerEntry {
  id: string;
  consultancy_organisation_id: string;
  client_organisation_id: string;
  entry_type: ServiceLedgerEntryType;
  occurred_at: string;
  summary: string;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VisitObservation {
  id: string;
  visit_id: string;
  company_id: string;
  location_section: string | null;
  observation_type: ObservationType;
  description: string;
  severity: ObservationSeverity | null;
  client_visible: boolean;
  action_required: boolean;
  linked_source_type: string | null;
  linked_source_id: string | null;
  resulting_action_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PortfolioOrganisation {
  organisation_id: string;
  name: string;
  organisation_type: string;
  role_key: string;
  access_scope: string;
}
