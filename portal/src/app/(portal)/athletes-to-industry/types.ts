// Shared types for the Athletes To Industry channel.

export interface RoleOpportunity {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface PartnerRow {
  id: string;
  company_name: string;
  locations: string | null;
  industry: string | null;
  website: string | null;
  logo_url: string | null;
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

// ── Training & Workshops ─────────────────────────────────

export interface TrainingOffering {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  format?: string | null;
  url?: string | null;
}

export interface TrainingProviderRow {
  id: string;
  provider_name: string;
  locations: string | null;
  category: string | null;
  website: string | null;
  logo_url: string | null;
  offerings: TrainingOffering[];
  active: boolean;
  created_at: string;
}

export type TrainingStatus = 'interested' | 'enrolled' | 'completed' | 'passed';

export interface TrainingInterestRow {
  id: string;
  athlete_id: string;
  provider_id: string;
  offering_id: string | null;
  status: TrainingStatus;
  notes: string | null;
  created_at: string;
}
