// Turning a plain-text job description into the HTML Manatal renders.
//
// THE DEFECT
//
// `requisitions.description` is a TEXTAREA. Operators write it with
// blank lines between paragraphs and one requirement per line, which is
// exactly how it reads back in our own UI. Manatal's `description` is
// **HTML** — every job Tom creates by hand is stored as `<p>`, `<ul>`,
// `<li>`, `<strong>`. HTML collapses whitespace, so a newline is not a
// line break and a blank line is not a paragraph.
//
// So the first role published through the route (job 4337074) reached
// Manatal — and the job boards it syndicates to — as ONE unbroken
// paragraph, with the nine languages of a requirements list run
// together into prose. Nothing errored. Manatal stored precisely what
// it was given.
//
// WHAT THIS DOES NOT DO
//
// It does not invent emphasis. A heading in the source is plain text
// and stays a paragraph; guessing which lines are headings would put
// `<strong>` around sentences the operator never marked up. The one
// structural inference it makes is the list, because a run of short
// unpunctuated lines is unambiguous in practice and is the difference
// between a readable advert and a wall of text.

/** Manatal renders the value as HTML, so anything the operator typed
 *  that looks like markup has to be neutralised. The live job carried
 *  "AI & Software Engineers", which is `AI &amp; Software` on the wire —
 *  an unescaped `&` is how a description acquires stray entities. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Bullet markers an operator actually types. */
const MARKER_RE = /^\s*[-*•·–—]\s+/;

/** A line short enough, and unpunctuated enough, to be a list item
 *  rather than a sentence. "Python" and "Data pipelines / ETL" pass;
 *  "We are recruiting for multiple opportunities…" does not. */
function looksLikeItem(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > 80) return false;
  return !/[.!?:;]$/.test(t);
}

function stripMarker(line: string): string {
  return line.replace(MARKER_RE, '').trim();
}

/**
 * An UNMARKED run becomes a list only at three or more lines.
 *
 * Two is genuinely ambiguous and guessing wrong is visible: the live
 * role opens with
 *
 *     Full-Time & Flexible Contract Options | Remote
 *     $60 - $120 per hour
 *
 * which are two standalone facts, not a bulleted pair — while
 *
 *     Python
 *     LLMs
 *     RAG
 *     …
 *
 * is nine and unmistakable. A line ending in a colon resolves the
 * ambiguity in the other direction, so after one, two is enough.
 *
 * A line carrying an EXPLICIT marker is always an item, at any length
 * of run — the operator said so.
 */
const UNMARKED_RUN_MIN = 3;
const UNMARKED_RUN_MIN_AFTER_COLON = 2;

function emitList(items: string[]): string {
  return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function emitPara(line: string): string {
  return `<p>${esc(line.trim())}</p>`;
}

/** Render one blank-line-delimited block. `afterColon` says whether the
 *  PREVIOUS block ended by announcing a list ("…experience in:"), which
 *  lowers the bar for the run that follows it. */
function renderBlock(block: string[], afterColon: boolean): string {
  const out: string[] = [];
  let i = 0;
  // Only the first run in a block can benefit from the previous
  // block's colon; anything after it has its own context.
  let colonCue = afterColon;

  while (i < block.length) {
    const line = block[i];

    if (MARKER_RE.test(line)) {
      const items: string[] = [];
      while (i < block.length && MARKER_RE.test(block[i])) items.push(stripMarker(block[i++]));
      out.push(emitList(items));
      colonCue = false;
      continue;
    }

    if (looksLikeItem(line)) {
      // Gather the maximal run of unmarked item-ish lines, then decide
      // whether it is long enough to BE a list.
      let j = i;
      while (j < block.length && !MARKER_RE.test(block[j]) && looksLikeItem(block[j])) j++;
      const run = block.slice(i, j);
      const min = colonCue ? UNMARKED_RUN_MIN_AFTER_COLON : UNMARKED_RUN_MIN;
      if (run.length >= min) {
        out.push(emitList(run.map(l => l.trim())));
      } else {
        for (const l of run) out.push(emitPara(l));
      }
      i = j;
      colonCue = false;
      continue;
    }

    out.push(emitPara(line));
    // A line that ends in a colon announces the list beneath it —
    // including one in the SAME block, which is the shape of
    // "…including:" followed immediately by six items.
    colonCue = /:$/.test(line.trim());
    i++;
  }

  return out.join('');
}

/** A titled `<ul>` for a list we hold as an array. */
function section(heading: string, items: string[] | null | undefined): string {
  const clean = (items ?? []).map(s => (s ?? '').trim()).filter(Boolean);
  if (clean.length === 0) return '';
  return `<p><strong>${esc(heading)}</strong></p>${emitList(clean)}`;
}

export interface DescriptionSource {
  description?:    string | null;
  must_haves?:     string[] | null;
  nice_to_haves?:  string[] | null;
}

/**
 * The `description` to send Manatal.
 *
 * `must_haves` / `nice_to_haves` are appended because we hold them and
 * were sending neither — a requirements list the operator filled in on
 * our side reached neither Manatal nor the job boards. They are the
 * same arrays the friction score and the referral gate read, so the
 * advert now states the criteria candidates are actually judged on.
 */
export function manatalDescriptionHtml(src: DescriptionSource): string {
  const raw = (src.description ?? '').replace(/\r\n?/g, '\n').trim();

  const blocks = raw
    .split(/\n\s*\n+/)
    .map(b => b.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== ''))
    .filter(b => b.length > 0);

  const parts: string[] = [];
  let afterColon = false;
  for (const block of blocks) {
    parts.push(renderBlock(block, afterColon));
    afterColon = /:$/.test(block[block.length - 1].trim());
  }

  parts.push(section('Essential requirements', src.must_haves));
  parts.push(section('Desirable', src.nice_to_haves));

  return parts.filter(Boolean).join('');
}
