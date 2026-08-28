// The one definition of "the job description we send to IvyLens".
//
// Two things consume it and they must agree, because IvyLens returns a
// `role_id` keyed to the text it was given: the new-role form (which
// analyses before the requisition exists, from form state) and the
// re-analyse route (which analyses an existing row). A second copy of
// this composition would mean a role re-analysed later scored against
// slightly different text from the one it was created with, and the
// difference would show up as an unexplained change in friction rather
// than as an error.
//
// It is also what gets persisted to `requisitions.jd_text`, which is the
// referral scan's fallback when a role has no `ivylens_role_id` — so a
// thin blob here is a thin scan for every applicant to that role.

export interface JdSource {
  title:          string;
  department?:    string | null;
  seniority?:     string | null;
  location?:      string | null;
  working_model?: string | null;
  salary_min?:    number | null;
  salary_max?:    number | null;
  must_haves?:    string[] | null;
  description?:   string | null;
}

function salaryLine(min?: number | null, max?: number | null): string {
  if (!min && !max) return '';
  const fmt = (n: number) => `£${n.toLocaleString('en-GB')}`;
  if (min && max) return `Salary: ${fmt(min)}-${fmt(max)}`;
  return `Salary: ${fmt((min ?? max) as number)}`;
}

/** Compose the JD blob. Empty fields are omitted rather than emitted as
 *  "Department: null" — a label with nothing after it is noise the
 *  scorer has to read past. */
export function buildJdText(src: JdSource): string {
  const musts = (src.must_haves ?? []).map(s => s.trim()).filter(Boolean);
  return [
    `Role: ${src.title}`,
    src.department    ? `Department: ${src.department}`       : '',
    src.seniority     ? `Seniority: ${src.seniority}`         : '',
    src.location      ? `Location: ${src.location}`           : '',
    src.working_model ? `Working model: ${src.working_model}` : '',
    salaryLine(src.salary_min, src.salary_max),
    musts.length ? `Requirements:\n${musts.map(s => `- ${s}`).join('\n')}` : '',
    src.description ? `\n${src.description}` : '',
  ].filter(Boolean).join('\n');
}

/** The analyse endpoints refuse anything shorter than this, so the UI
 *  can say why before spending a call. */
export const MIN_JD_TEXT_LENGTH = 20;
