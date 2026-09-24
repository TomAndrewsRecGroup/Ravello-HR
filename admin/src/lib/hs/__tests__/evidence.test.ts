import { describe, expect, it } from 'vitest';
import { evidenceKey, safeFileName } from '../evidence';

// The storage policies (095) read the key's first folder as the client
// and its second as the kind of record; hs_files' CHECK requires the
// same three leading parts. A key built any other way is refused, or
// worse, filed under the wrong client.
describe('evidence keys', () => {
  const co = '23526e83-afc1-4c6e-85d6-ab7d42dc0709';
  const item = '7b1c9e0a-1111-4a2b-9c3d-000000000001';

  it('puts the client, record type and record first', () => {
    const k = evidenceKey(co, 'register_completion', item, 'LOLER report.pdf', 'fixed');
    expect(k).toBe(`${co}/register_completion/${item}/fixed-LOLER_report.pdf`);
    expect(k.split('/').slice(0, 3)).toEqual([co, 'register_completion', item]);
  });

  it('a file name can never add a folder or climb out of one', () => {
    for (const name of ['../../other/x.pdf', 'a/b/c.pdf', '..', '/etc/passwd', 'x\\y.pdf']) {
      const k = evidenceKey(co, 'register_item', item, name, 'id');
      expect(k.split('/')).toHaveLength(4);
      expect(k).not.toContain('..');
    }
  });

  it('keeps names readable and bounded', () => {
    expect(safeFileName('Fire risk assessment 2026.pdf')).toBe('Fire_risk_assessment_2026.pdf');
    expect(safeFileName('x'.repeat(400) + '.pdf').length).toBeLessThanOrEqual(120);
    expect(safeFileName('')).toBe('file');
  });
});
