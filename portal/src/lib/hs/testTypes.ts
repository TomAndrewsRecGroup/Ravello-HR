// Row shapes for the Tests tables (migration 116). Untyped Supabase
// clients, so these are what the pages agree on — same posture as
// lib/hs/types.ts.

import type { HsTestQuestion } from './testMarking';
import type { HsTestSourceType } from './vocab';

export interface HsTest {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_type: HsTestSourceType;
  external_url: string | null;
  pass_mark: number | null;
  questions: HsTestQuestion[] | null;
  certifies_training: boolean;
  recert_months: number | null;
  // Optional: which training_courses row a PASS of this test satisfies
  // (migration 183). Always a standard/global course (company_id NULL)
  // — hs_tests are assigned across many client companies, and the
  // database itself refuses any other kind (hs_tests_course_guard).
  course_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HsTestSession {
  id: string;
  test_id: string;
  title: string;
  scheduled_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface HsTestAssignment {
  id: string;
  session_id: string | null;
  test_id: string;
  company_id: string;
  employee_id: string;
  status: 'pending' | 'completed';
  created_at: string;
}

export interface HsTestSubmission {
  id: string;
  assignment_id: string;
  company_id: string;
  employee_id: string;
  test_id: string;
  source: HsTestSourceType;
  score: number | null;
  passed: boolean;
  answers: Record<string, string> | null;
  notes: string | null;
  recorded_by_kind: 'employee' | 'staff';
  submitted_at: string;
}
