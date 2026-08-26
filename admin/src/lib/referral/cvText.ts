// Builds the text the IvyLens scan is run against.
//
// Two sources, in preference order:
//
//   cv_pdf         — the real CV, fetched from Manatal's presigned
//                    resume URL and text-extracted. Richest signal:
//                    project prose is where evidence of a specific
//                    technology usually lives.
//   manatal_parsed — a blob assembled from the fields Manatal already
//                    extracted (skills, titles, employers, education).
//                    Thinner, but it never expires and never 403s.
//
// WHY THE FALLBACK EXISTS, AND WHY IT MUST BE RECORDED
//
// Manatal's `resume` is a presigned CloudFront URL that expires about
// an hour after it is issued. An expired link answers 403. Because CV
// text is only ever used as scan input, an unhandled 403 does not
// surface as an error — it surfaces as a candidate whose CV said
// nothing, and IvyLens scores them near zero.
//
// So every result carries the `source` that produced it, it is
// persisted on referral_applications.scan_source, and it is shown in
// the admin UI. A thin scan must be VISIBLY thin. If the
// manatal_parsed share climbs, PDF fetching is broken — and that is
// something to notice on a dashboard rather than mistake for a run of
// weak applicants.

import {
  getManatalCandidateEducations,
  getManatalCandidateExperiences,
  type ManatalCandidate,
} from '../manatal';
import type { ScanSource } from './types';

/** Below this many characters the extraction is treated as failed.
 *  A scanned-image CV (a photo in a PDF wrapper) extracts to a handful
 *  of stray characters, which would otherwise be scored as if it were
 *  the candidate's real CV. */
const MIN_USEFUL_CV_CHARS = 400;

/** Manatal CVs are small; anything larger is not a CV. Guards the
 *  serverless function's memory. */
const MAX_CV_BYTES = 12 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 20_000;

/** IvyLens truncates its own input, but sending less over the wire
 *  keeps us inside the scan endpoint's request limits. */
const MAX_SCAN_CHARS = 24_000;

export interface ScanTextResult {
  text:   string;
  source: ScanSource;
  /** Populated when the PDF path was attempted and did not work, even
   *  though a usable fallback was produced. Recorded so a systematic
   *  extraction failure is diagnosable after the fact. */
  error?: string;
  bytes?: number;
}

/* ─── PDF ──────────────────────────────────────────────────── */

async function extractPdfText(url: string): Promise<{ text: string; bytes: number }> {
  const res = await fetch(url, {
    cache:  'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // 403 here almost always means the presigned URL expired between
    // being read and being used. Say so explicitly — this is the
    // failure most likely to be misread as "weak candidate".
    throw new Error(
      res.status === 403
        ? 'HTTP 403 fetching CV — the presigned Manatal URL had most likely expired (they last ~1 hour).'
        : `HTTP ${res.status} fetching CV.`,
    );
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_CV_BYTES) {
    throw new Error(`CV is ${Math.round(buf.byteLength / 1024 / 1024)}MB, over the ${MAX_CV_BYTES / 1024 / 1024}MB cap.`);
  }

  // Imported lazily so the pdf machinery is only pulled into the
  // serverless bundle's runtime path when a CV is actually read.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc  = await getDocumentProxy(new Uint8Array(buf));
  const out  = await extractText(doc, { mergePages: true });
  const text = (Array.isArray(out.text) ? out.text.join('\n') : out.text ?? '').trim();

  return { text, bytes: buf.byteLength };
}

/* ─── Manatal's own parse ──────────────────────────────────── */

function line(label: string, value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : value;
  return v ? `${label}: ${v}\n` : '';
}

/** Assemble a structured blob from what Manatal already extracted.
 *
 *  Deliberately labelled and prose-like rather than JSON: the scan is
 *  an LLM read of a CV, and it does better on something shaped like a
 *  CV than on a serialised object. */
export function buildParsedText(
  candidate: ManatalCandidate,
  experiences: Array<{ title?: string | null; company_name?: string | null; description?: string | null; start_date?: string | null; end_date?: string | null }> = [],
  educations: Array<{ degree?: string | null; school_name?: string | null; field_of_study?: string | null }> = [],
): string {
  let out = '';
  out += line('Name', candidate.full_name);
  out += line('Current position', candidate.current_position);
  out += line('Current employer', candidate.current_company);
  out += line('Location', candidate.candidate_location);
  out += line('Highest qualification', candidate.latest_degree);
  out += line('Institution', candidate.latest_university);

  const skills = (candidate.skills ?? []).map(s => s.skill_name).filter(Boolean);
  if (skills.length) out += `\nSkills: ${skills.join(', ')}\n`;

  if (candidate.description?.trim()) {
    out += `\nSummary:\n${candidate.description.trim()}\n`;
  }

  if (experiences.length) {
    out += '\nExperience:\n';
    for (const e of experiences) {
      const period = [e.start_date, e.end_date].filter(Boolean).join(' to ');
      out += `- ${[e.title, e.company_name].filter(Boolean).join(' at ')}${period ? ` (${period})` : ''}\n`;
      if (e.description?.trim()) out += `  ${e.description.trim().replace(/\s+/g, ' ')}\n`;
    }
  }

  if (educations.length) {
    out += '\nEducation:\n';
    for (const ed of educations) {
      out += `- ${[ed.degree, ed.field_of_study, ed.school_name].filter(Boolean).join(', ')}\n`;
    }
  }

  return out.trim();
}

/* ─── Entry point ──────────────────────────────────────────── */

/** Produce scan text for one candidate, preferring the real CV.
 *
 *  Never throws: a candidate with no readable CV and no parsed fields
 *  still returns (with empty text), and the caller decides what an
 *  empty scan input means. Throwing here would abort a whole batch
 *  over one malformed PDF. */
export async function buildScanText(candidate: ManatalCandidate): Promise<ScanTextResult> {
  let pdfError: string | undefined;

  if (candidate.resume) {
    try {
      const { text, bytes } = await extractPdfText(candidate.resume);
      if (text.length >= MIN_USEFUL_CV_CHARS) {
        return { text: text.slice(0, MAX_SCAN_CHARS), source: 'cv_pdf', bytes };
      }
      pdfError = `Extracted only ${text.length} characters (minimum ${MIN_USEFUL_CV_CHARS}) — likely a scanned image rather than a text PDF.`;
    } catch (err) {
      pdfError = (err as Error)?.message ?? 'Unknown error extracting CV text.';
    }
  } else {
    pdfError = 'Candidate has no resume on file in Manatal.';
  }

  // Fallback. Experiences and educations are best-effort — if those
  // calls fail we still return the core blob rather than nothing.
  let experiences: Awaited<ReturnType<typeof getManatalCandidateExperiences>> = [];
  let educations:  Awaited<ReturnType<typeof getManatalCandidateEducations>>  = [];
  try {
    [experiences, educations] = await Promise.all([
      getManatalCandidateExperiences(candidate.id),
      getManatalCandidateEducations(candidate.id),
    ]);
  } catch {
    /* best-effort; the blob below still carries skills and titles */
  }

  return {
    text:   buildParsedText(candidate, experiences, educations).slice(0, MAX_SCAN_CHARS),
    source: 'manatal_parsed',
    error:  pdfError,
  };
}
