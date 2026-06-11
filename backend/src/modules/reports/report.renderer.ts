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
