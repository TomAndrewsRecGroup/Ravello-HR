import { describe, it, expect } from 'vitest';
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_PREFIX,
  checkStagedPath,
  sanitiseFilename,
  stagedAttachmentPath,
} from '../attachmentPaths';

const ME    = 'a3f1e0c2-0000-4000-8000-000000000001';
const OTHER = 'b7c2d4e6-0000-4000-8000-000000000002';

const ok = (p: string, uid = ME) => checkStagedPath(p, uid).ok;

describe('checkStagedPath — the service role bypasses RLS, so this is the gate', () => {
  it('accepts the caller\'s own staged file', () => {
    expect(ok(`outbox/${ME}/1699_cv.pdf`)).toBe(true);
  });

  // The one that matters. The route fetches with the service role, so a
  // path pointing at somebody else's folder would be served happily.
  it('REFUSES another user\'s staged file', () => {
    const r = checkStagedPath(`outbox/${OTHER}/1699_cv.pdf`, ME);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/another user/);
  });

  it('refuses traversal even when the shape looks right', () => {
    // Three-ish segments and the correct prefix — the traversal check
    // has to run BEFORE the structural one or this reads as valid.
    expect(ok(`outbox/${ME}/../../cvs/someone.pdf`)).toBe(false);
    expect(ok(`outbox/../${ME}/x.pdf`)).toBe(false);
    expect(ok(`../outbox/${ME}/x.pdf`)).toBe(false);
  });

  it('refuses absolute paths, backslashes and NUL', () => {
    expect(ok(`/outbox/${ME}/x.pdf`)).toBe(false);
    expect(ok(`outbox\\${ME}\\x.pdf`)).toBe(false);
    expect(ok(`outbox/${ME}/x\0.pdf`)).toBe(false);
  });

  it('refuses a different prefix — reaching outside the outbox', () => {
    expect(ok(`documents/${ME}/x.pdf`)).toBe(false);
    expect(ok(`cvs/${ME}/x.pdf`)).toBe(false);
  });

  it('refuses the wrong number of segments', () => {
    expect(ok(`outbox/${ME}`)).toBe(false);                    // no file
    expect(ok(`outbox/${ME}/sub/x.pdf`)).toBe(false);          // nested
    expect(ok(`outbox//x.pdf`)).toBe(false);                   // empty uid
    expect(ok(`outbox/${ME}/`)).toBe(false);                   // empty file
  });

  it('refuses non-strings and over-long keys', () => {
    expect(ok(undefined as unknown as string)).toBe(false);
    expect(ok(null as unknown as string)).toBe(false);
    expect(ok(42 as unknown as string)).toBe(false);
    expect(ok('')).toBe(false);
    expect(ok(`outbox/${ME}/${'x'.repeat(600)}.pdf`)).toBe(false);
  });

  it('names which rule tripped, so a refusal is diagnosable', () => {
    const reasons = [
      checkStagedPath('', ME),
      checkStagedPath(`outbox/${ME}/../x`, ME),
      checkStagedPath(`documents/${ME}/x`, ME),
      checkStagedPath(`outbox/${OTHER}/x`, ME),
    ].map(r => (r.ok === false ? r.reason : ''));
    expect(new Set(reasons).size).toBe(reasons.length); // all distinct
  });
});

describe('the bucket is a constant, not an input', () => {
  it('is the dedicated staff-only bucket', () => {
    // If this ever reads from a request, the route becomes an
    // arbitrary-file-read of documents/, cvs/ and every client file.
    expect(ATTACHMENT_BUCKET).toBe('email-attachments');
    expect(ATTACHMENT_PREFIX).toBe('outbox');
  });
});

describe('sanitiseFilename', () => {
  it('removes anything that would invent a folder level', () => {
    expect(sanitiseFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitiseFilename('a/b\\c.pdf')).not.toMatch(/[/\\]/);
  });

  it('strips CR/LF so a name cannot inject a MIME header', () => {
    const out = sanitiseFilename('x.pdf\r\nContent-Type: text/html');
    expect(out).not.toMatch(/[\r\n]/);
  });

  it('never returns empty', () => {
    expect(sanitiseFilename('///')).toBeTruthy();
    expect(sanitiseFilename('')).toBe('attachment');
  });

  it('keeps an ordinary name readable', () => {
    expect(sanitiseFilename('Q3 Report v2.pdf')).toBe('Q3 Report v2.pdf');
  });
});

describe('stagedAttachmentPath', () => {
  it('builds a path its own validator accepts', () => {
    const p = stagedAttachmentPath(ME, 'Q3 Report.pdf', 'abc123');
    expect(ok(p)).toBe(true);
  });

  it('builds an ACCEPTABLE path even from a hostile filename', () => {
    // The writer and the checker have to agree; a name that sanitises
    // into extra segments would be uploadable and then unattachable.
    const p = stagedAttachmentPath(ME, '../../../etc/passwd', 'abc123');
    expect(ok(p)).toBe(true);
    expect(p.split('/')).toHaveLength(3);
  });

  it('keeps two same-named files in one message apart', () => {
    expect(stagedAttachmentPath(ME, 'cv.pdf', 'one'))
      .not.toBe(stagedAttachmentPath(ME, 'cv.pdf', 'two'));
  });
});
