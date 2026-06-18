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
}

/**
 * Renders the muster-roll "Attendance" grid: worker-info columns followed by one
 * 2-column (IN/Out) block per day, grouped under per-month headers. Mirrors the
 * layout of the workforce workbook's Attendance sheet.
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
  rows.forEach((row, i) => {
    const values = [...row.info, ...row.cells];
    const wsRow = ws.getRow(5 + i);
    values.forEach((v, j) => {
      const cell = wsRow.getCell(j + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.border = thin;
      if (j >= n) cell.alignment = { horizontal: 'center' };
    });
  });

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
  rows.forEach((row, i) => {
    const values = [...row.info, ...row.cells];
    const wsRow = ws.getRow(3 + i);
    values.forEach((v, j) => {
      const cell = wsRow.getCell(j + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.border = thin;
      if (j >= n) cell.alignment = { horizontal: 'center' };
    });
  });

  for (let c = 1; c <= n; c++) ws.getColumn(c).width = c === 1 ? 6 : 16;
  for (let c = n + 1; c <= lastCol; c++) ws.getColumn(c).width = 4;
  ws.views = [{ state: 'frozen', xSplit: n, ySplit: 2 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
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

    doc.font('Helvetica-Bold').fontSize(12).text(title, left, 24);
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
