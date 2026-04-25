// Shared types for the Athletes To Industry channel (admin side).
// `RoleOpportunity` is re-exported from the API layer (single source of truth)
// so the JSON validator and the UI consumers stay in sync.
export type { RoleOpportunity } from '@/lib/partners/roleOpportunities';
import type { RoleOpportunity } from '@/lib/partners/roleOpportunities';

export interface PartnerRow {
  id: string;
  company_name: string;
  locations: string | null;
  industry: string | null;
  website: string | null;
  role_opportunities: RoleOpportunity[];
  active: boolean;
  created_at: string;
}

export interface AthleteRow {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  sport: string | null;
  previous_role: string | null;
  bio: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  cv_kind: 'file' | 'text' | null;
  cv_url: string | null;
  cv_filename: string | null;
  cv_mime: string | null;
  cv_text: string | null;
  created_at: string;
  company_name?: string | null;
}

export type InterestStatus = 'interested' | 'introduced' | 'passed';

export interface InterestRow {
  id: string;
  athlete_id: string;
  partner_id: string;
  role_opportunity_id: string | null;
  status: InterestStatus;
  notes: string | null;
  created_at: string;
}
