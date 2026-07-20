import * as fs from 'fs';
import { ManpowerReport, renderManpowerPdf } from './report.renderer';

function sample(overrides: Partial<ManpowerReport> = {}): ManpowerReport {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.UTC(2026, 6, 20) - i * 86_400_000).toISOString().slice(0, 10));
  }
  return {
    reportType: 'DAILY',
    periodLabel: '20 Jul 2026',
    days,
    trend: [112, 118, 118, 125, 110, 118, 110],
    periodFrom: days[6],
    totalManDays: 118,
    uniqueWorkers: 116,
    manHours: 944,
    activeTrades: 8,
    avgPerDay: 118,
    peak: 125,
    byTrade: [
      { name: 'Masons', count: 35 },
      { name: 'Carpenters', count: 22 },
      { name: 'Electricians', count: 18 },
      { name: 'Plumbers', count: 17 },
      { name: 'General Labors', count: 12 },
      { name: 'Riggers', count: 8 },
      { name: 'Crane Operators', count: 8 },
    ],
    byVendor: [
      { name: 'BuildRight Contractors', count: 41 },
      { name: 'Prime Electric', count: 24 },
      { name: 'Apex Plumbing', count: 18 },
      { name: 'HSM Steel', count: 12 },
      { name: 'City Labors', count: 12 },
      { name: 'Crane Services', count: 11 },
    ],
    ...overrides,
  };
}

describe('renderManpowerPdf', () => {
  it('renders a non-trivial PDF', async () => {
    const buf = await renderManpowerPdf(sample(), 'Sunrise Constructions Pvt Ltd');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
    if (process.env.MANPOWER_PDF_OUT) fs.writeFileSync(process.env.MANPOWER_PDF_OUT, buf);
  });

  it('survives an empty period without throwing', async () => {
    const buf = await renderManpowerPdf(
      sample({
        trend: [0, 0, 0, 0, 0, 0, 0],
        totalManDays: 0,
        uniqueWorkers: 0,
        manHours: 0,
        activeTrades: 0,
        avgPerDay: 0,
        peak: 0,
        byTrade: [],
        byVendor: [],
      }),
      'Sunrise Constructions Pvt Ltd',
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('handles a month-long period and many trades', async () => {
    const days: string[] = [];
    const trend: number[] = [];
    for (let i = 0; i < 31; i++) {
      days.push(new Date(Date.UTC(2026, 5, 1) + i * 86_400_000).toISOString().slice(0, 10));
      trend.push(80 + ((i * 7) % 45));
    }
    const buf = await renderManpowerPdf(
      sample({
        reportType: 'MONTHLY',
        periodLabel: 'June 2026',
        days,
        trend,
        byTrade: Array.from({ length: 14 }, (_, i) => ({
          name: `Trade with a rather long name ${i}`,
          count: 40 - i * 2,
        })),
        byVendor: Array.from({ length: 12 }, (_, i) => ({
          name: `Vendor ${i}`,
          count: 30 - i * 2,
        })),
      }),
      'Sunrise Constructions Pvt Ltd',
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
