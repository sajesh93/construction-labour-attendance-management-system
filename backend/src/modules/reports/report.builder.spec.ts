import { minutesToHours, toCsv } from './report.builder';

describe('report.builder', () => {
  it('builds CSV with header and rows', () => {
    const csv = toCsv(['A', 'B'], [[1, 'x'], [2, 'y']]);
    expect(csv).toBe('A,B\n1,x\n2,y');
  });

  it('escapes values containing commas, quotes, and newlines', () => {
    const csv = toCsv(['Name'], [['Doe, John'], ['say "hi"'], ['line\nbreak']]);
    expect(csv).toBe('Name\n"Doe, John"\n"say ""hi"""\n"line\nbreak"');
  });

  it('converts minutes to hours with 2 decimals', () => {
    expect(minutesToHours(90)).toBe('1.50');
    expect(minutesToHours(0)).toBe('0.00');
    expect(minutesToHours(null)).toBe('0.00');
  });
});
