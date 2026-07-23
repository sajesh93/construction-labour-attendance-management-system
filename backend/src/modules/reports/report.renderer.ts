import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

type Row = (string | number | null)[];

/** Renders report rows to an XLSX buffer (in-process — no worker needed). */
export async function renderXlsx(title: string, headers: string[], rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31) || 'Report');

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' },
  };
  for (const row of rows) ws.addRow(row);

  ws.columns.forEach((col, i) => {
    const headerLen = headers[i]?.length ?? 10;
    col.width = Math.min(32, Math.max(12, headerLen + 4));
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface AttSheetMonth {
  label: string;
  /** Day-of-month numbers included for this block (may be a partial month). */
  days: number[];
}
export interface AttSheetRow {
  info: (string | number | null)[];
  cells: (string | null)[];
  /**
   * Section divider — when set, the row is a banner spanning the whole sheet
   * ("SECOND LOGIN OF THE DAY") and `info`/`cells` are empty.
   */
  heading?: string;
}

/**
 * Writes the data rows of a muster-roll sheet, starting at `startRow`. Shared by
 * the times and presence layouts, which differ only in how tall their headers
 * are. A row carrying a heading becomes a banner merged across the sheet.
 */
function writeAttSheetRows(
  ws: ExcelJS.Worksheet,
  rows: AttSheetRow[],
  startRow: number,
  infoCols: number,
  lastCol: number,
  thin: Partial<ExcelJS.Borders>,
): void {
  const bannerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD6E2F2' },
  };
  rows.forEach((row, i) => {
    const r = startRow + i;
    if (row.heading) {
      ws.mergeCells(r, 1, r, lastCol);
      const cell = ws.getCell(r, 1);
      cell.value = row.heading;
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.fill = bannerFill;
      cell.border = thin;
      return;
    }
    const wsRow = ws.getRow(r);
    [...row.info, ...row.cells].forEach((v, j) => {
      const cell = wsRow.getCell(j + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.border = thin;
      if (j >= infoCols) cell.alignment = { horizontal: 'center' };
    });
  });
}

/**
 * Renders the muster-roll "Attendance" grid: worker-info columns followed by one
 * 2-column (IN/Out) block per day, grouped under per-month headers. Mirrors the
 * layout of the workforce workbook's Attendance sheet.
 *
 * A worker who tapped in more than once on any day of the period gets a further
 * block below the first, one per shift, so a split shift reads as the two
 * stretches it actually was rather than one unbroken run.
 */
export async function renderAttendanceSheetXlsx(
  months: AttSheetMonth[],
  infoHeaders: string[],
  rows: AttSheetRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' },
  };
  const monthFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD6E2F2' },
  };
  const thin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    left: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    bottom: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    right: { style: 'thin', color: { argb: 'FFBFC7D1' } },
  };

  const n = infoHeaders.length;
  // Info columns: one header each, merged down all four header rows.
  infoHeaders.forEach((h, i) => {
    const c = i + 1;
    ws.mergeCells(1, c, 4, c);
    const cell = ws.getCell(1, c);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = headerFill;
    cell.border = thin;
  });

  // Day blocks, grouped by month.
  let col = n + 1;
  for (const mo of months) {
    const blockStart = col;
    const blockWidth = mo.days.length * 2;
    ws.mergeCells(1, blockStart, 2, blockStart + blockWidth - 1);
    const mcell = ws.getCell(1, blockStart);
    mcell.value = mo.label;
    mcell.font = { bold: true };
    mcell.alignment = { horizontal: 'center', vertical: 'middle' };
    mcell.fill = monthFill;
    mcell.border = thin;
    for (const day of mo.days) {
      ws.mergeCells(3, col, 3, col + 1);
      const dcell = ws.getCell(3, col);
      dcell.value = day;
      dcell.font = { bold: true };
      dcell.alignment = { horizontal: 'center' };
      dcell.fill = headerFill;
      dcell.border = thin;
      const inCell = ws.getCell(4, col);
      inCell.value = 'IN';
      const outCell = ws.getCell(4, col + 1);
      outCell.value = 'Out';
      for (const hc of [inCell, outCell]) {
        hc.font = { bold: true, size: 9 };
        hc.alignment = { horizontal: 'center' };
        hc.fill = headerFill;
        hc.border = thin;
      }
      col += 2;
    }
  }
  const lastCol = col - 1;

  // Data rows start at row 5 (after the four header rows).
  writeAttSheetRows(ws, rows, 5, n, lastCol, thin);

  for (let c = 1; c <= n; c++) ws.getColumn(c).width = c === 1 ? 6 : 16;
  for (let c = n + 1; c <= lastCol; c++) ws.getColumn(c).width = 6;
  ws.views = [{ state: 'frozen', xSplit: n, ySplit: 4 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Renders the muster-roll grid in PRESENCE mode: worker-info columns followed by
 * one column per day holding P (present) / A (absent) / blank (not employed),
 * grouped under per-month headers. Three header rows: month, day, then data.
 */
export async function renderPresenceSheetXlsx(
  months: AttSheetMonth[],
  infoHeaders: string[],
  rows: AttSheetRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' },
  };
  const monthFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD6E2F2' },
  };
  const thin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    left: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    bottom: { style: 'thin', color: { argb: 'FFBFC7D1' } },
    right: { style: 'thin', color: { argb: 'FFBFC7D1' } },
  };

  const n = infoHeaders.length;
  // Info columns: one header each, merged down both header rows (month + day).
  infoHeaders.forEach((h, i) => {
    const c = i + 1;
    ws.mergeCells(1, c, 2, c);
    const cell = ws.getCell(1, c);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = headerFill;
    cell.border = thin;
  });

  // One column per day, grouped by month.
  let col = n + 1;
  for (const mo of months) {
    const blockStart = col;
    ws.mergeCells(1, blockStart, 1, blockStart + mo.days.length - 1);
    const mcell = ws.getCell(1, blockStart);
    mcell.value = mo.label;
    mcell.font = { bold: true };
    mcell.alignment = { horizontal: 'center', vertical: 'middle' };
    mcell.fill = monthFill;
    mcell.border = thin;
    for (const day of mo.days) {
      const dcell = ws.getCell(2, col);
      dcell.value = day;
      dcell.font = { bold: true, size: 9 };
      dcell.alignment = { horizontal: 'center' };
      dcell.fill = headerFill;
      dcell.border = thin;
      col += 1;
    }
  }
  const lastCol = col - 1;

  // Data rows start at row 3 (after the two header rows).
  writeAttSheetRows(ws, rows, 3, n, lastCol, thin);

  for (let c = 1; c <= n; c++) ws.getColumn(c).width = c === 1 ? 6 : 16;
  for (let c = n + 1; c <= lastCol; c++) ws.getColumn(c).width = 4;
  ws.views = [{ state: 'frozen', xSplit: n, ySplit: 2 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ManpowerReport {
  reportType: string;
  periodLabel: string;
  days: string[];
  trend: number[];
  periodFrom: string;
  totalManDays: number;
  uniqueWorkers: number;
  manHours: number;
  activeTrades: number;
  avgPerDay: number;
  peak: number;
  byTrade: { name: string; count: number }[];
  byVendor: { name: string; count: number }[];
}

/** Chart palette, matching the admin dashboard so print and screen agree. */
const CHART_COLORS = [
  '#3E5BA9',
  '#B7791F',
  '#0091AD',
  '#A8452B',
  '#7C4DBE',
  '#1E7F4F',
  '#9B2C6F',
  '#2B6CB0',
];
const INK = '#1A2233';
const MUTED = '#6B7686';
const GRID = '#DFE4EC';

type Doc = PDFKit.PDFDocument;

/** Optispace wordmark, ~2.58:1. Copied into dist by the nest-cli assets glob. */
const LOGO_PATH = join(__dirname, '../../assets/logo.png');
const LOGO_RATIO = 1129 / 437;
let logoBuf: Buffer | null | undefined;

function loadLogo(): Buffer | null {
  if (logoBuf === undefined) {
    logoBuf = existsSync(LOGO_PATH) ? readFileSync(LOGO_PATH) : null;
  }
  return logoBuf;
}

/**
 * Draws the wordmark with its right edge at `right` and the given height,
 * returning the width it consumed (0 when the asset is missing — a branding
 * flourish must never fail a report).
 */
function drawLogo(doc: Doc, right: number, y: number, h: number): number {
  const buf = loadLogo();
  if (!buf) return 0;
  const w = h * LOGO_RATIO;
  doc.image(buf, right - w, y, { height: h });
  return w;
}

/**
 * pdfkit loops forever laying text out in a box narrower than a single glyph,
 * so every computed text width goes through this floor.
 */
const textW = (w: number) => Math.max(8, w);

/** Panel frame with a title, returning the inner drawing box. */
function panel(doc: Doc, x: number, y: number, w: number, h: number, title: string) {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(GRID).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text(title.toUpperCase(), x + 12, y + 11, {
      width: textW(w - 24),
      lineBreak: false,
      ellipsis: true,
    });
  return { x: x + 14, y: y + 32, w: w - 28, h: h - 46 };
}

/** Area + line chart with a labelled point at every day. */
function drawTrend(
  doc: Doc,
  box: { x: number; y: number; w: number; h: number },
  r: ManpowerReport,
) {
  const { x, y, w, h } = box;
  const n = r.trend.length;
  if (n === 0) return;
  const max = Math.max(...r.trend, 1);
  // Headroom so the value labels above the peak are not clipped.
  const scaleY = (v: number) => y + h - (v / (max * 1.18)) * h;
  const stepX = n > 1 ? w / (n - 1) : 0;
  const px = (i: number) => (n > 1 ? x + i * stepX : x + w / 2);

  // Baseline + light horizontal guides.
  doc.lineWidth(0.5).strokeColor(GRID);
  for (let g = 0; g <= 2; g++) {
    const gy = y + (h / 2) * g;
    doc
      .moveTo(x, gy)
      .lineTo(x + w, gy)
      .stroke();
  }

  const points = r.trend.map((v, i) => ({ px: px(i), py: scaleY(v) }));
  // Filled area under the line.
  doc.save();
  doc.moveTo(points[0].px, y + h);
  points.forEach((p) => doc.lineTo(p.px, p.py));
  doc
    .lineTo(points[n - 1].px, y + h)
    .closePath()
    .fillColor(CHART_COLORS[0])
    .fillOpacity(0.13)
    .fill();
  doc.restore();

  doc.lineWidth(1.4).strokeColor(CHART_COLORS[0]);
  points.forEach((p, i) => (i === 0 ? doc.moveTo(p.px, p.py) : doc.lineTo(p.px, p.py)));
  doc.stroke();

  // Markers, value labels and date ticks. Long periods (a month) would collide,
  // so label every nth point once past a dozen days.
  const every = n > 12 ? Math.ceil(n / 10) : 1;
  points.forEach((p, i) => {
    const show = i % every === 0 || i === n - 1;
    doc
      .circle(p.px, p.py, show ? 2.2 : 1.2)
      .fillColor(CHART_COLORS[0])
      .fillOpacity(1)
      .fill();
    if (!show) return;
    doc
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .fillColor(INK)
      .text(String(r.trend[i]), p.px - 12, p.py - 12, {
        width: 24,
        align: 'center',
        lineBreak: false,
      });
    const d = new Date(`${r.days[i]}T00:00:00.000Z`);
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor(MUTED)
      .text(
        d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        p.px - 16,
        y + h + 5,
        { width: 32, align: 'center', lineBreak: false },
      );
  });
}

/** Vertical bars with a count above each and a rotated-free label below. */
function drawBars(
  doc: Doc,
  box: { x: number; y: number; w: number; h: number },
  items: { name: string; count: number }[],
) {
  const { x, y, w, h } = box;
  if (items.length === 0) return;
  const shown = items.slice(0, 8);
  const max = Math.max(...shown.map((i) => i.count), 1);
  const slot = w / shown.length;
  const barW = Math.min(30, slot * 0.55);

  shown.forEach((item, i) => {
    const cx = x + slot * i + slot / 2;
    // Leave room for the value label above and two label lines below — trade
    // names are long and a single line would ellipsis most of them away.
    const usable = h - 36;
    const barH = Math.max(2, (item.count / max) * usable);
    const by = y + 14 + (usable - barH);
    doc
      .rect(cx - barW / 2, by, barW, barH)
      .fillColor(CHART_COLORS[i % CHART_COLORS.length])
      .fillOpacity(0.85)
      .fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(INK)
      .fillOpacity(1)
      .text(String(item.count), cx - slot / 2, by - 11, {
        width: slot,
        align: 'center',
        lineBreak: false,
      });
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor(MUTED)
      .text(item.name, cx - slot / 2 + 1, y + h - 20, {
        width: textW(slot - 2),
        align: 'center',
        // Two lines, then ellipsis — enough for "Crane Operators".
        height: 18,
        ellipsis: true,
      });
  });
}

/** Donut with a legend listing each slice and its share. */
function drawDonut(
  doc: Doc,
  box: { x: number; y: number; w: number; h: number },
  items: { name: string; count: number }[],
) {
  const { x, y, w, h } = box;
  const total = items.reduce((a, b) => a + b.count, 0);
  if (total === 0) return;
  const shown = items.slice(0, 7);
  const rest = total - shown.reduce((a, b) => a + b.count, 0);
  const slices = rest > 0 ? [...shown, { name: 'Other', count: rest }] : shown;

  // Reserve the legend column first, then size the donut to whatever is left.
  // Sizing the donut first can leave the legend a negative width, and pdfkit
  // spins forever trying to lay text out in a box narrower than one glyph.
  const legendW = Math.max(0, Math.min(96, w * 0.46));
  const donutW = w - legendW - 10;
  const outer = Math.max(18, Math.min(donutW, h - 8) / 2 - 2);
  const inner = outer * 0.58;
  const cx = x + outer + 2;
  const cy = y + h / 2 - 4;

  let angle = -Math.PI / 2;
  slices.forEach((s, i) => {
    const sweep = (s.count / total) * Math.PI * 2;
    const end = angle + sweep;
    doc.save();
    doc
      .moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      .lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    // pdfkit has no arc primitive, so trace the curve in small steps.
    const steps = Math.max(2, Math.ceil(sweep / 0.12));
    for (let k = 1; k <= steps; k++) {
      const a = angle + (sweep * k) / steps;
      doc.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    }
    doc.lineTo(cx + Math.cos(end) * inner, cy + Math.sin(end) * inner);
    for (let k = steps; k >= 0; k--) {
      const a = angle + (sweep * k) / steps;
      doc.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    }
    doc
      .closePath()
      .fillColor(CHART_COLORS[i % CHART_COLORS.length])
      .fillOpacity(0.9)
      .fill();
    doc.restore();
    angle = end;
  });

  // Legend to the right of the donut. Too narrow to read is worse than absent.
  const lx = cx + outer + 10;
  const lw = x + w - lx;
  if (lw < 40) return;
  let ly = y + 4;
  doc.fillOpacity(1);
  slices.forEach((s, i) => {
    if (ly > y + h - 8) return;
    doc
      .circle(lx + 3, ly + 4, 3)
      .fillColor(CHART_COLORS[i % CHART_COLORS.length])
      .fill();
    const pct = Math.round((s.count / total) * 100);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(INK)
      .text(`${s.name} (${pct}%)`, lx + 10, ly, {
        width: textW(lw - 12),
        ellipsis: true,
        lineBreak: false,
      });
    ly += 12;
  });
}

/** Big-number tile. */
function drawTile(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(GRID).stroke();
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(label.toUpperCase(), x + 12, y + 12, {
      width: textW(w - 24),
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(INK)
    .text(value, x + 12, y + 25, { width: textW(w - 24), lineBreak: false, ellipsis: true });
}

/**
 * Renders the manpower report as a one-page landscape A4 dashboard: a header
 * strip, the trend, by-trade bars and a vendor donut, then headline tiles.
 * Drawn with pdfkit vectors — no chart library or headless browser involved.
 */
export function renderManpowerPdf(r: ManpowerReport, orgName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 28;
    const pageW = doc.page.width;
    const contentW = pageW - M * 2;

    // ---- Header strip ----
    doc.rect(0, 0, pageW, 58).fillColor('#F4F6FA').fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(INK)
      .text(`${r.reportType} MANPOWER REPORT`, M, 16, { lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(orgName, M, 36, { width: contentW / 2, lineBreak: false, ellipsis: true });
    drawLogo(doc, pageW - M, 10, 20);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(r.periodLabel, M + contentW / 2, 36, {
        width: contentW / 2,
        align: 'right',
        lineBreak: false,
      });
    doc.lineWidth(1.5).strokeColor(CHART_COLORS[0]).moveTo(0, 58).lineTo(pageW, 58).stroke();

    // ---- Chart row ----
    const rowY = 76;
    const rowH = 250;
    const gap = 12;
    const trendW = contentW * 0.36;
    const barsW = contentW * 0.3;
    const donutW = contentW - trendW - barsW - gap * 2;

    drawTrend(
      doc,
      panel(doc, M, rowY, trendW, rowH, `Total manpower trend (${r.days.length} days)`),
      r,
    );
    drawBars(doc, panel(doc, M + trendW + gap, rowY, barsW, rowH, 'Manpower by trade'), r.byTrade);
    drawDonut(
      doc,
      panel(doc, M + trendW + barsW + gap * 2, rowY, donutW, rowH, 'Manpower by vendor'),
      r.byVendor,
    );

    // ---- Tiles ----
    const tileY = rowY + rowH + 14;
    const tileH = 62;
    const tiles: [string, string][] = [
      ['Total man-days', String(r.totalManDays)],
      ['Unique workers', String(r.uniqueWorkers)],
      ['Logged man-hours', String(r.manHours)],
      ['Active trades', String(r.activeTrades)],
      ['Avg / day', String(r.avgPerDay)],
      ['Peak day', String(r.peak)],
    ];
    const tileW = (contentW - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([label, value], i) => {
      drawTile(doc, M + (tileW + gap) * i, tileY, tileW, tileH, label, value);
    });

    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(MUTED)
      .text(
        `Generated ${new Date().toLocaleString('en-GB', { timeZone: 'UTC' })} UTC · labour only, excludes staff and visitors`,
        M,
        tileY + tileH + 10,
        { width: contentW, lineBreak: false },
      );

    doc.end();
  });
}

/** Renders report rows to a simple landscape-A4 PDF table buffer. */
export function renderPdf(title: string, headers: string[], rows: Row[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 24;
    const usable = doc.page.width - left * 2;
    const colW = usable / headers.length;
    const rowH = 13;
    const bottom = doc.page.height - 28;

    // Logo first, so the title can be clipped short of it on narrow pages.
    const logoW = drawLogo(doc, left + usable, 22, 16);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(title, left, 24, { width: usable - logoW - 12, ellipsis: true, lineBreak: false });
    let y = 46;

    const drawRow = (cells: Row, bold: boolean) => {
      if (y + rowH > bottom) {
        doc.addPage();
        y = 28;
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5);
      cells.forEach((cell, i) => {
        doc.text(cell == null ? '' : String(cell), left + i * colW, y, {
          width: colW - 3,
          ellipsis: true,
          lineBreak: false,
        });
      });
      y += rowH;
    };

    drawRow(headers, true);
    for (const row of rows) drawRow(row, false);
    doc.end();
  });
}
