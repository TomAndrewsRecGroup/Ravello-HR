// Row shapes for the H&S tables (migrations 094/095). The Supabase
// clients here are untyped, so these are what the pages agree on.

import type {
  HsActivityType, HsCompletionOutcome, HsRecurrenceUnit,
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
