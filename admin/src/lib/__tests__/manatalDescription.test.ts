// The description that reached Manatal as one paragraph.
//
// The fixture is the VERBATIM `requisitions.description` of the first
// role published through the route (7ae62d7d, job 4337074) — read out
// of the database, not retyped — because the defect is entirely about
// what that specific shape of plain text becomes.

import { describe, expect, it } from 'vitest';
import { manatalDescriptionHtml } from '../manatalDescription';

/** Verbatim. Note what makes it hard: the requirement runs carry no
 *  bullet markers at all, one of them butts straight onto the next
 *  heading with no blank line, and the intro pair of short lines is
 *  NOT a list. */
const LIVE_DESCRIPTION = `AI & Software Engineers – Remote Opportunities

Full-Time & Flexible Contract Options | Remote
$60 - $120 per hour

We are recruiting for multiple opportunities with a fast-growing AI technology business working on advanced AI systems and software engineering projects.

There are currently two routes available:

AI/ML Engineer – Full-Time

Suitable for candidates with experience in:

Python
LLMs
RAG
Prompt engineering
LangChain / LangGraph
Cloud AI platforms
APIs / SDKs
Data pipelines / ETL
CI/CD

Approx. 15 hours per week | Flexible hours

You will work on technical tasks designed to help train next-generation AI systems, including:
Debugging
Feature development
Refactoring
Performance optimisation
Software testing
Working with complex codebases`;

describe('the description that shipped as one blob', () => {
  const html = manatalDescriptionHtml({ description: LIVE_DESCRIPTION });

  it('is HTML, not newline-separated text', () => {
    // This is the whole bug: Manatal renders the value as HTML, so a
    // \n is not a line break and the entire advert ran together.
    expect(html).not.toMatch(/\n/);
    expect(html.startsWith('<p>')).toBe(true);
  });

  it('makes the nine languages a list rather than prose', () => {
    expect(html).toContain('<li>Python</li>');
    expect(html).toContain('<li>Data pipelines / ETL</li>');
    expect(html).toContain('<li>CI/CD</li>');
  });

  it('makes the second unmarked run a list too', () => {
    // This run is announced by "…including:" on the line directly
    // above it, inside the same block — no blank line separates them.
    expect(html).toContain('<li>Debugging</li>');
    expect(html).toContain('<li>Working with complex codebases</li>');
    expect(html).toContain('<p>You will work on technical tasks designed to help train next-generation AI systems, including:</p>');
  });

  it('does NOT turn the two intro lines into a list', () => {
    // A run of two unmarked short lines is ambiguous, and these are
    // two standalone facts. Bulleting them would be the formatter
    // inventing structure.
    expect(html).toContain('<p>Full-Time &amp; Flexible Contract Options | Remote</p>');
    expect(html).toContain('<p>$60 - $120 per hour</p>');
    expect(html).not.toContain('<li>$60 - $120 per hour</li>');
  });

  it('escapes the ampersand rather than emitting raw markup', () => {
    expect(html).toContain('AI &amp; Software Engineers');
    expect(html).not.toContain('AI & Software Engineers');
  });

  it('keeps every sentence of the source', () => {
    // Guard the guard: a formatter that DROPS content would satisfy
    // several assertions above. Strip the tags back off and check the
    // prose survived.
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    expect(text).toContain('We are recruiting for multiple opportunities with a fast-growing AI technology business');
    expect(text).toContain('There are currently two routes available:');
    expect(text).toContain('Approx. 15 hours per week | Flexible hours');
  });
});

describe('list detection', () => {
  it('honours an explicit marker at any run length', () => {
    // One marked line is a list of one — the operator said so.
    expect(manatalDescriptionHtml({ description: '- Only this' })).toBe('<ul><li>Only this</li></ul>');
    const two = manatalDescriptionHtml({ description: '• First\n• Second' });
    expect(two).toBe('<ul><li>First</li><li>Second</li></ul>');
  });

  it('accepts every marker an operator types', () => {
    for (const m of ['-', '*', '•', '·', '–', '—']) {
      expect(manatalDescriptionHtml({ description: `${m} Item` })).toBe('<ul><li>Item</li></ul>');
    }
  });

  it('needs three unmarked lines, or two after a colon', () => {
    expect(manatalDescriptionHtml({ description: 'Alpha\nBeta' }))
      .toBe('<p>Alpha</p><p>Beta</p>');
    expect(manatalDescriptionHtml({ description: 'Alpha\nBeta\nGamma' }))
      .toBe('<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>');
    expect(manatalDescriptionHtml({ description: 'You will need:\nAlpha\nBeta' }))
      .toBe('<p>You will need:</p><ul><li>Alpha</li><li>Beta</li></ul>');
  });

  it('carries the colon cue across a blank line', () => {
    // The live role separates "…experience in:" from its list with a
    // blank line, so the cue has to survive the block boundary.
    expect(manatalDescriptionHtml({ description: 'Experience in:\n\nAlpha\nBeta' }))
      .toBe('<p>Experience in:</p><ul><li>Alpha</li><li>Beta</li></ul>');
  });

  it('never lists a sentence', () => {
    const prose = 'We are looking for somebody great.\nThey will do good work here.\nApply today please.';
    const html = manatalDescriptionHtml({ description: prose });
    expect(html).not.toContain('<li>');
  });

  it('never lists a long line', () => {
    const long = Array(4).fill('x'.repeat(90)).join('\n');
    expect(manatalDescriptionHtml({ description: long })).not.toContain('<li>');
  });
});

describe('requirements we hold and were not sending', () => {
  it('appends must_haves and nice_to_haves as real lists', () => {
    // Six must_haves sat on the live requisition and reached neither
    // Manatal nor the job boards.
    const html = manatalDescriptionHtml({
      description:   'Some role.',
      must_haves:    ['Python', 'C++', 'Rust'],
      nice_to_haves: ['Kubernetes'],
    });
    expect(html).toContain('<p><strong>Essential requirements</strong></p><ul><li>Python</li><li>C++</li><li>Rust</li></ul>');
    expect(html).toContain('<p><strong>Desirable</strong></p><ul><li>Kubernetes</li></ul>');
  });

  it('omits a heading with nothing under it', () => {
    const html = manatalDescriptionHtml({ description: 'Some role.', must_haves: [], nice_to_haves: null });
    expect(html).toBe('<p>Some role.</p>');
    expect(html).not.toContain('Essential requirements');
  });

  it('drops blank entries rather than emitting an empty bullet', () => {
    const html = manatalDescriptionHtml({ description: 'R.', must_haves: ['Python', '', '  '] });
    expect(html).toContain('<ul><li>Python</li></ul>');
    expect(html).not.toContain('<li></li>');
  });
});

describe('degenerate input', () => {
  it('returns empty for nothing at all', () => {
    expect(manatalDescriptionHtml({})).toBe('');
    expect(manatalDescriptionHtml({ description: null })).toBe('');
    expect(manatalDescriptionHtml({ description: '   \n\n  ' })).toBe('');
  });

  it('handles CRLF, which is what a Windows paste carries', () => {
    expect(manatalDescriptionHtml({ description: 'One\r\n\r\nTwo' })).toBe('<p>One</p><p>Two</p>');
  });

  it('still produces a body when the description is empty but requirements are not', () => {
    // Otherwise a role captured as title + requirements advertises blank.
    expect(manatalDescriptionHtml({ description: '', must_haves: ['Python'] }))
      .toBe('<p><strong>Essential requirements</strong></p><ul><li>Python</li></ul>');
  });
});
