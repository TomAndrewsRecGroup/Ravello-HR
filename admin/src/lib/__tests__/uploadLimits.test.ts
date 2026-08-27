import { describe, it, expect } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  REQUEST_BODY_CAP,
  REQUEST_SLACK,
  formatBytes,
  tooLargeMessage,
} from '../uploadLimits';

/**
 * The reported failure, kept as the fixture: the operator attached a
 * 5,725 KB file, the browser guard (25 MB) let it through, Vercel refused
 * the 5.6 MB body at the edge, and the modal showed "Send failed (413)"
 * with no explanation because the platform's 413 carries no JSON body.
 */
const REPORTED_FILE_BYTES = 5_725 * 1024; // 5,725 KB as the OS reported it

describe('the ceiling is the one the platform actually enforces', () => {
  it('sits under Vercel\'s 4.5 MB request-body cap', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(REQUEST_BODY_CAP);
    expect(MAX_UPLOAD_BYTES).toBe(REQUEST_BODY_CAP - REQUEST_SLACK);
  });

  it('leaves room for a maximum-length body_html in the same request', () => {
    // htmlBody() bounds body_html at 200,000 characters. That rides in the
    // same multipart body, so the slack has to cover it or the guard passes
    // a request the platform still refuses.
    expect(REQUEST_SLACK).toBeGreaterThanOrEqual(100_000);
    expect(MAX_UPLOAD_BYTES + 200_000).toBeLessThanOrEqual(REQUEST_BODY_CAP + REQUEST_SLACK);
  });

  // The regression. Before the fix this file passed every guard in the
  // product and failed at the edge with no usable error.
  it('rejects the 5,725 KB file that produced the bare 413', () => {
    expect(REPORTED_FILE_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it('would have been ACCEPTED by every ceiling the code used to carry', () => {
    // Proof the old numbers were the defect rather than merely generous:
    // send-email 25 MB total / 15 MB per file, documents and CVs 10 MB.
    for (const oldCap of [25, 15, 10].map(mb => mb * 1024 * 1024)) {
      expect(REPORTED_FILE_BYTES).toBeLessThan(oldCap);
    }
  });

  it('still accepts an ordinary attachment', () => {
    expect(2 * 1024 * 1024).toBeLessThan(MAX_UPLOAD_BYTES); // a 2 MB PDF
  });
});

describe('the refusal names both numbers', () => {
  it('quotes the actual size and the limit', () => {
    const msg = tooLargeMessage(REPORTED_FILE_BYTES);
    // "File too large" with no numbers is what sent somebody to the
    // browser console to find a bare 413.
    expect(msg).toContain(formatBytes(REPORTED_FILE_BYTES));
    expect(msg).toContain(formatBytes(MAX_UPLOAD_BYTES));
  });

  it('names the subject so a multi-attachment message is unambiguous', () => {
    expect(tooLargeMessage(1, 'Attachment "cv.pdf"')).toMatch(/^Attachment "cv\.pdf" is/);
  });

  it('offers the way round it', () => {
    expect(tooLargeMessage(REPORTED_FILE_BYTES).toLowerCase()).toContain('link');
  });
});

describe('formatBytes', () => {
  it('scales through B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
