import { describe, it, expect } from 'vitest';
import { csvCell } from '../src/export/exporters';

describe('CSV cells', () => {
  it('quotes and keeps ordinary text', () => {
    expect(csvCell('PLC "main", line 1')).toBe('"PLC ""main"", line 1"');
    expect(csvCell(42)).toBe('"42"');
  });
  it('turns anything a spreadsheet would run as a formula into text', () => {
    for (const v of ['=HYPERLINK("http://x")', '+CAB1-K1', '-1+1', '@SUM(A1)', '\t=1', '\r=1']) expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });
});
