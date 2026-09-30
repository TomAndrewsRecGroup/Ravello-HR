// Core-OS 360 Phase 16: Cross-Client Lessons Learned Network (migration 181).

export const LESSON_LEARNED_CATEGORIES = [
  'people', 'plant_equipment', 'process', 'procedure', 'environment', 'management',
  'training', 'supervision', 'maintenance', 'communication', 'design', 'contractor', 'organisational',
] as const;
export type LessonLearnedCategory = typeof LESSON_LEARNED_CATEGORIES[number];

export const LESSON_LEARNED_CATEGORY_LABELS: Record<LessonLearnedCategory, string> = {
  people: 'People', plant_equipment: 'Plant / Equipment', process: 'Process', procedure: 'Procedure',
  environment: 'Environment', management: 'Management', training: 'Training', supervision: 'Supervision',
  maintenance: 'Maintenance', communication: 'Communication', design: 'Design', contractor: 'Contractor',
  organisational: 'Organisational',
};

export const LESSON_LEARNED_STATUSES = ['draft', 'published', 'archived'] as const;
export type LessonLearnedStatus = typeof LESSON_LEARNED_STATUSES[number];

export const LESSON_LEARNED_SOURCE_TYPES = ['incident', 'audit_finding', 'inspection'] as const;
export type LessonLearnedSourceType = typeof LESSON_LEARNED_SOURCE_TYPES[number];

export const LESSON_LEARNED_SOURCE_TYPE_LABELS: Record<LessonLearnedSourceType, string> = {
  incident: 'Incident', audit_finding: 'Audit finding', inspection: 'Inspection',
};

export interface LessonLearned {
  id: string;
  title: string;
  category: LessonLearnedCategory;
  summary: string;
  recommended_action: string | null;
  source_type: LessonLearnedSourceType | null;
  source_id: string | null;
  status: LessonLearnedStatus;
  created_by: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonLearnedDistribution {
  id: string;
  lesson_id: string;
  company_id: string;
  distributed_by: string | null;
  distributed_at: string;
}

export interface LessonLearnedRead {
  id: string;
  lesson_id: string;
  company_id: string;
  read_by: string;
  read_by_name: string | null;
  read_at: string;
}
