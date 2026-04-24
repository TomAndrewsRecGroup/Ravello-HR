export interface AthleteFields {
  full_name?: string;
  email?: string | null;
  sport?: string | null;
  previous_role?: string | null;
  bio?: string | null;
  linkedin_url?: string | null;
  cv_kind?: 'file' | 'text' | null;
  cv_text?: string | null;
}

export const CV_MIME_ALLOW = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export const CV_EXT_ALLOW = new Set(['pdf', 'doc', 'docx', 'txt']);

export const CV_MAX_BYTES = 10 * 1024 * 1024;          // 10 MB
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;       //  4 MB
export const AVATAR_MIME_ALLOW = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function buildPatch(body: AthleteFields): Record<string, unknown> | { error: string } {
  const patch: Record<string, unknown> = {};

  if (body.full_name !== undefined) {
    const v = body.full_name.trim();
    if (!v) return { error: 'full_name cannot be empty' };
    patch.full_name = v.slice(0, 200);
  }
  if (body.email !== undefined) patch.email = body.email?.trim()?.slice(0, 200) || null;
  if (body.sport !== undefined) patch.sport = body.sport?.trim()?.slice(0, 100) || null;
  if (body.previous_role !== undefined) patch.previous_role = body.previous_role?.trim()?.slice(0, 200) || null;
  if (body.bio !== undefined) patch.bio = body.bio?.trim()?.slice(0, 5000) || null;
  if (body.linkedin_url !== undefined) {
    const v = body.linkedin_url?.trim();
    if (!v) {
      patch.linkedin_url = null;
    } else {
      try {
        const u = new URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { error: 'linkedin_url must be http(s)' };
        }
        patch.linkedin_url = u.toString();
      } catch {
        return { error: 'invalid linkedin_url' };
      }
    }
  }
  if (body.cv_kind !== undefined) {
    if (body.cv_kind === null) {
      patch.cv_kind = null;
      patch.cv_text = null;
    } else if (body.cv_kind === 'file' || body.cv_kind === 'text') {
      patch.cv_kind = body.cv_kind;
    } else {
      return { error: 'cv_kind must be file or text' };
    }
  }
  if (body.cv_text !== undefined) {
    patch.cv_text = body.cv_text?.slice(0, 50_000) || null;
  }

  return patch;
}
