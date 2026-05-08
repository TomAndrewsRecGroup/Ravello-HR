// Shared types for the Athletes To Industry channel.
// `RoleOpportunity` and `TrainingOffering` are re-exported from the
// lib layer so the shape stays aligned with the admin app's validator.
export type { RoleOpportunity } from '@/lib/partners/roleOpportunities';
export type { TrainingOffering } from '@/lib/training/offerings';
import type { RoleOpportunity } from '@/lib/partners/roleOpportunities';
import type { TrainingOffering } from '@/lib/training/offerings';

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
  phone: string | null;
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

// ── Training & Workshops ─────────────────────────────────

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
