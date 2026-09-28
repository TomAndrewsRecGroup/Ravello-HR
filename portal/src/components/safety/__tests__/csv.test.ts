import { describe, expect, it } from 'vitest';
import { toCsv } from '../CsvButton';

// Safety registers are exported to CSV and opened in Excel. A title or
// location a reporter typed must never execute there as a formula.
describe('toCsv', () => {
  const cols = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
  it('quotes every cell and doubles embedded quotes', () => {
    expect(toCsv(cols, [{ a: 'x, "y"', b: 3 }])).toBe('"A","B"\r\n"x, ""y""","3"');
  });
  it.each(['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx'])('neutralises a formula-leading cell %j', v => {
    const line = toCsv(cols, [{ a: v, b: '' }]).split('\r\n')[1];
    expect(line.startsWith(`"'`)).toBe(true);
  });
  it('joins arrays and blanks nulls', () => {
    expect(toCsv(cols, [{ a: ['one', 'two'], b: null }]).split('\r\n')[1]).toBe('"one; two",""');
  });
});
