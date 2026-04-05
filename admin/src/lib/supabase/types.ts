// ─── Ravello Database Types ──────────────────────────────────────────────────
// Auto-generate from Supabase once connected:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type HiringStage =
  | 'submitted'
  | 'in_progress'
  | 'shortlist_ready'
  | 'interview'
  | 'offer'
  | 'filled'
  | 'cancelled';

export type TicketStatus  = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type DocCategory   = 'contract' | 'policy' | 'letter' | 'report' | 'other';
export type UserRole      = 'client_admin' | 'client_user' | 'tps_admin' | 'tps_client';

export type FrictionLevel = 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';

// ─── Friction Lens Types ──────────────────────────────────────────────────────

export interface ExtractedRole {
  title?:           string;
  location?:        string;
  salary_min?:      number;
  salary_max?:      number;
  required_skills?: string[];
  working_model?:   string;
  seniority?:       string;
  employment_type?: string;
  department?:      string;
}

export interface FrictionScore {
  overall_score:         number;
  overall_level:         FrictionLevel;
  friction_score:        number;
  clarity_score:         number;
  overload_score:        number;
  required_skills_count: number;
  ivylens_role_id?:      string;
  extracted_role?:       ExtractedRole;
  recommendations:       string[];
  time_to_fill_estimate: string;
}

// ─── Table Row Types ──────────────────────────────────────────────────────────

export interface Company {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  size_band: string | null;
  sector: string | null;
  contact_email: string | null;
  active: boolean;
  feature_flags: FeatureFlags;
}

export interface FeatureFlags {
  hiring:        boolean;
  documents:     boolean;
  reports:       boolean;
  support:       boolean;
  metrics:       boolean;
  compliance:    boolean;
  friction_lens: boolean;
  [key: string]: boolean;
}

// ─── Company Friction Lens Types ────────────────────────────────────────────

export type FrictionBand = 'Low Friction' | 'Moderate Friction' | 'High Friction';
export type EmployeeBand = 'micro' | 'small' | 'mid' | 'large';

export interface CompanyAssessment {
  id:                  string;
  company_id:          string;
  ivylens_company_id?: string;
  employee_count:      number;
  employee_band:       EmployeeBand;
  form_responses:      Record<string, any>;
  overall_band:        FrictionBand | null;
  confidence:          string | null;
  dimensions:          AssessmentDimension[];
  top_signals:         string[];
  summary:             string | null;
  benchmarks:          any | null;
  created_at:          string;
  updated_at:          string;
}

export interface AssessmentDimension {
  name:            string;
  band:            FrictionBand;
  signal_count:    number;
  signals:         AssessmentSignal[];
  fields_answered: number;
  fields_total:    number;
}

export interface AssessmentSignal {
  signal_type: string;
  severity:    'critical' | 'high' | 'medium' | 'low';
  detail:      string;
}

export interface CompanyFrictionItem {
  id:            string;
  company_id:    string;
  assessment_id: string | null;
  dimension:     string;
  field_key:     string;
  label:         string;
  severity:      string | null;
  is_completed:  boolean;
  completed_at:  string | null;
  completed_by:  string | null;
  notes:         string | null;
  created_at:    string;
}

export interface Notification {
  id:         string;
  user_id:    string;
  company_id: string | null;
  type:       string;
  title:      string;
  body:       string | null;
  link:       string | null;
  read:       boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  created_at: string;
  company_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
}

export interface Requisition {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  title: string;
  department: string | null;
  seniority: string | null;
  salary_range: string | null;
  location: string | null;
  employment_type: string | null;
  description: string | null;
  must_haves: string[] | null;
  stage: HiringStage;
  submitted_by: string;
  assigned_recruiter: string | null;
}

export interface Candidate {
  id: string;
  created_at: string;
  requisition_id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  summary: string | null;
  cv_url: string | null;
  recruiter_notes: string | null;
  approved_for_client: boolean;
  client_status: 'pending' | 'approved' | 'rejected' | 'info_requested';
  client_feedback: string | null;
}

export interface Document {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  name: string;
  category: DocCategory;
  file_url: string;
  file_size: number | null;
  version: number;
  uploaded_by: string;
  review_due_at: string | null;
  notes: string | null;
}

export interface Ticket {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  submitted_by: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  resolved_at: string | null;
}

export interface TicketMessage {
  id: string;
  created_at: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  is_internal: boolean;
}

export interface Report {
  id: string;
  created_at: string;
  company_id: string;
  title: string;
  period: string | null;
  file_url: string;
  generated_by: string;
}

export interface ComplianceItem {
  id: string;
  created_at: string;
  company_id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: 'pending' | 'in_review' | 'complete' | 'overdue';
  category: string;
  assigned_to: string | null;
}

// ─── Database shape ───────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      companies:        { Row: Company;       Insert: Partial<Company>;       Update: Partial<Company>; };
      profiles:         { Row: Profile;        Insert: Partial<Profile>;        Update: Partial<Profile>; };
      requisitions:     { Row: Requisition;    Insert: Partial<Requisition>;    Update: Partial<Requisition>; };
      candidates:       { Row: Candidate;      Insert: Partial<Candidate>;      Update: Partial<Candidate>; };
      documents:        { Row: Document;       Insert: Partial<Document>;       Update: Partial<Document>; };
      tickets:          { Row: Ticket;         Insert: Partial<Ticket>;         Update: Partial<Ticket>; };
      ticket_messages:  { Row: TicketMessage;  Insert: Partial<TicketMessage>;  Update: Partial<TicketMessage>; };
      reports:          { Row: Report;         Insert: Partial<Report>;         Update: Partial<Report>; };
      compliance_items: { Row: ComplianceItem; Insert: Partial<ComplianceItem>; Update: Partial<ComplianceItem>; };
    };
    Views:   Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      hiring_stage:   HiringStage;
      ticket_status:  TicketStatus;
      doc_category:   DocCategory;
      user_role:      UserRole;
    };
  };
}
