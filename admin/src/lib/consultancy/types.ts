// Core-OS 360 Phase 6 row shapes. Shared-dupe pair with portal
// (scripts/check-shared-dupes.sh).

import type { ReviewFrequency, ServiceScopeStatus, ServiceType, VisitStatus, VisitType } from './vocab';

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioOrganisation {
  organisation_id: string;
  name: string;
  organisation_type: string;
  role_key: string;
  access_scope: string;
}
