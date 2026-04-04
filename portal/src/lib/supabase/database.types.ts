/**
 * Supabase Database types.
 *
 * IMPORTANT: This file should be regenerated from the live database using:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
 *
 * The types below are manually maintained to cover the most-used tables.
 * They eliminate the <any> generic on createServerClient/createBrowserClient
 * and provide type safety on .select(), .insert(), .update() calls.
 */

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sector: string | null;
          size_band: string | null;
          contact_email: string | null;
          active: boolean;
          feature_flags: Record<string, boolean>;
          friction_band: string | null;
          account_owner_id: string | null;
          onboarding_status: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['companies']['Row']> & { name: string; slug: string };
        Update: Partial<Database['public']['Tables']['companies']['Row']>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          company_id: string | null;
          role: string;
          avatar_url: string | null;
          onboarding_completed: boolean;
          onboarding_step: number;
          ui_preferences: Record<string, any>;
          privacy_consent_at: string | null;
          marketing_consent: boolean;
          data_processing_consent: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; email: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      requisitions: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          department: string | null;
          seniority: string | null;
          salary_min: number | null;
          salary_max: number | null;
          location: string | null;
          employment_type: string | null;
          description: string | null;
          must_haves: string[] | null;
          stage: string;
          submitted_by: string;
          assigned_recruiter: string | null;
          working_model: string | null;
          friction_score: Record<string, any> | null;
          friction_level: string | null;
          friction_recommendations: string[] | null;
          jd_text: string | null;
          managed_by: string;
          internal_applicants: Record<string, any>[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['requisitions']['Row']> & { company_id: string; title: string; submitted_by: string };
        Update: Partial<Database['public']['Tables']['requisitions']['Row']>;
      };
      candidates: {
        Row: {
          id: string;
          requisition_id: string;
          company_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          summary: string | null;
          cv_url: string | null;
          approved_for_client: boolean;
          client_status: string;
          client_feedback: string | null;
          screening_score: number | null;
          pipeline_stage: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['candidates']['Row']> & { requisition_id: string; company_id: string; full_name: string };
        Update: Partial<Database['public']['Tables']['candidates']['Row']>;
      };
      tickets: {
        Row: {
          id: string;
          company_id: string;
          submitted_by: string;
          subject: string;
          description: string;
          status: string;
          priority: string;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['tickets']['Row']> & { company_id: string; subject: string; description: string };
        Update: Partial<Database['public']['Tables']['tickets']['Row']>;
      };
      documents: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          category: string;
          file_url: string;
          file_size: number | null;
          version: number;
          review_due_at: string | null;
          status: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['documents']['Row']> & { company_id: string; name: string; file_url: string };
        Update: Partial<Database['public']['Tables']['documents']['Row']>;
      };
      compliance_items: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          description: string | null;
          due_date: string;
          status: string;
          category: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['compliance_items']['Row']> & { company_id: string; title: string; due_date: string };
        Update: Partial<Database['public']['Tables']['compliance_items']['Row']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          company_id: string | null;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & { type: string; title: string };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
      };
      employee_records: {
        Row: {
          id: string;
          company_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          job_title: string;
          department: string | null;
          employment_type: string;
          status: string;
          start_date: string;
          end_date: string | null;
          gender: string | null;
          ethnicity: string | null;
          annual_leave_allowance: number;
          sick_day_allowance: number | null;
          leave_year_type: string;
          leave_year_start_month: number;
          leave_year_start_day: number;
          line_manager: string | null;
          salary: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['employee_records']['Row']> & { company_id: string; full_name: string; job_title: string; start_date: string };
        Update: Partial<Database['public']['Tables']['employee_records']['Row']>;
      };
      actions: {
        Row: {
          id: string;
          company_id: string;
          action_type: string;
          title: string;
          description: string | null;
          priority: string;
          status: string;
          dismiss_until: string | null;
          completed_at: string | null;
          due_date: string | null;
          created_by_admin: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['actions']['Row']> & { company_id: string; title: string; action_type: string };
        Update: Partial<Database['public']['Tables']['actions']['Row']>;
      };
      client_services: {
        Row: {
          id: string;
          company_id: string;
          service_name: string;
          service_tier: string;
          start_date: string;
          status: string;
          monthly_fee: number | null;
          renewal_date: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['client_services']['Row']> & { company_id: string; service_name: string; service_tier: string; start_date: string };
        Update: Partial<Database['public']['Tables']['client_services']['Row']>;
      };
      internal_tasks: {
        Row: {
          id: string;
          company_id: string | null;
          assigned_to: string | null;
          created_by: string;
          title: string;
          description: string | null;
          priority: string;
          status: string;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['internal_tasks']['Row']> & { title: string; created_by: string };
        Update: Partial<Database['public']['Tables']['internal_tasks']['Row']>;
      };
      client_notes: {
        Row: {
          id: string;
          company_id: string;
          author_id: string;
          note_type: string;
          title: string | null;
          body: string;
          pinned: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['client_notes']['Row']> & { company_id: string; author_id: string; body: string };
        Update: Partial<Database['public']['Tables']['client_notes']['Row']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
