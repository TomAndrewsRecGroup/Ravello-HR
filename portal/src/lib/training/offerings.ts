// Type re-exported from admin/src/lib/training/offerings.ts.
// The admin app owns JSONB validation/normalisation server-side; the portal
// only needs the shape for read-side rendering, so we mirror the interface
// here (kept in sync manually — this is a multi-Vercel-project monorepo
// without a shared workspace package).

export interface TrainingOffering {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Free text label like "Course", "Workshop", "Webinar"; not enforced. */
  format?: string | null;
  url?: string | null;
}
