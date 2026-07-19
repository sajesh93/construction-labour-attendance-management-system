import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { Permission, roleHasPermission } from '../../common/rbac/permissions';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { capSessionHours, minutesToHours, toCsv } from './report.builder';
import {
  AttSheetMonth,
  AttSheetRow,
  renderAttendanceSheetXlsx,
  renderPresenceSheetXlsx,
  renderPdf,
  renderXlsx,
} from './report.renderer';
import { CreateReportDto, ReportType } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Whether to include sensitive (joining) columns: caller opted in via
   * params.includeSensitive AND holds WORKER_VIEW_SENSITIVE. Records an audit
   * entry the first time it resolves true for a request.
   */
  private async resolveSensitive(
    user: AuthUser,
    params: Record<string, unknown>,
    reportType: ReportType,
  ): Promise<boolean> {
    const wants = params.includeSensitive === true || params.includeSensitive === 'true';
    if (!wants) return false;
    if (!roleHasPermission(user.role, Permission.WORKER_VIEW_SENSITIVE)) return false;
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_AADHAAR_REVEAL',
      entityType: 'Report',
      // entityId is a UUID column — a report has no single entity, so leave it
      // null and carry the report type in newValue instead.
      entityId: null,
      newValue: { reportType },
      reason: 'Full-profile report (sensitive data)',
    });
    return true;
  }

  private decryptOrBlank(blob: Uint8Array | null): string {
    if (!blob) return '';
    try {
      return this.crypto.decrypt(Buffer.from(blob));
    } catch {
      return '';
    }
  }

  /**
   * Generate a report. All formats render inline in the API process — CSV as
   * text, XLSX/PDF as base64 — so no separate worker deployment is required.
   */
  async create(user: AuthUser, dto: CreateReportDto) {
    const params = dto.params ?? {};
    const sensitive = await this.resolveSensitive(user, params, dto.reportType);

    // The attendance grid has a bespoke (merged-header) XLSX layout, so it gets
    // its own build + render path; CSV/PDF fall back to a flat representation.
    if (dto.reportType === ReportType.ATTENDANCE_SHEET) {
      const sheet = await this.buildAttendanceSheet(user, params, sensitive);
      const job = await this.prisma.reportJob.create({
        data: {
          organizationId: user.organizationId,
          requestedBy: user.userId,
          reportType: dto.reportType,
          format: dto.format,
          params: params as Prisma.InputJsonValue,
          status: 'DONE',
          completedAt: new Date(),
        },
      });
      const base = { jobId: job.id, status: job.status, rowCount: sheet.rows.length };
      const stem = `attendance-sheet-${job.id}`;
      if (dto.format === 'XLSX') {
        const buffer = sheet.presence
          ? await renderPresenceSheetXlsx(sheet.months, sheet.infoHeaders, sheet.rows)
          : await renderAttendanceSheetXlsx(sheet.months, sheet.infoHeaders, sheet.rows);
        return {
          ...base,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contentBase64: buffer.toString('base64'),
          filename: `${stem}.xlsx`,
        };
      }
      if (dto.format === 'PDF') {
        const buffer = await renderPdf('Attendance sheet', sheet.flatHeaders, sheet.flatRows);
        return {
          ...base,
          contentType: 'application/pdf',
          contentBase64: buffer.toString('base64'),
          filename: `${stem}.pdf`,
        };
      }
      return {
        ...base,
        contentType: 'text/csv',
        content: toCsv(sheet.flatHeaders, sheet.flatRows),
        filename: `${stem}.csv`,
      };
    }

    const { headers, rows } = await this.buildRows(user, dto.reportType, params, sensitive);

    const job = await this.prisma.reportJob.create({
      data: {
        organizationId: user.organizationId,
        requestedBy: user.userId,
        reportType: dto.reportType,
        format: dto.format,
        params: params as Prisma.InputJsonValue,
        status: 'DONE',
        completedAt: new Date(),
      },
    });

    const title = `${dto.reportType} report`;
    const base = {
      jobId: job.id,
      status: job.status,
      rowCount: rows.length,
    };

    if (dto.format === 'XLSX') {
      const buffer = await renderXlsx(title, headers, rows);
      return {
        ...base,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: buffer.toString('base64'),
        filename: `report-${dto.reportType.toLowerCase()}-${job.id}.xlsx`,
      };
    }
    if (dto.format === 'PDF') {
      const buffer = await renderPdf(title, headers, rows);
      return {
        ...base,
        contentType: 'application/pdf',
        contentBase64: buffer.toString('base64'),
        filename: `report-${dto.reportType.toLowerCase()}-${job.id}.pdf`,
      };
    }
    return {
      ...base,
      contentType: 'text/csv',
      content: toCsv(headers, rows),
      filename: `report-${dto.reportType.toLowerCase()}-${job.id}.csv`,
    };
  }

  /** Build the report rows without persisting a job — powers the admin preview. */
  async preview(user: AuthUser, reportType: ReportType, params: Record<string, unknown> = {}) {
    const sensitive = await this.resolveSensitive(user, params, reportType);
    if (reportType === ReportType.ATTENDANCE_SHEET) {
      const sheet = await this.buildAttendanceSheet(user, params, sensitive);
      return { headers: sheet.flatHeaders, rows: sheet.flatRows, rowCount: sheet.flatRows.length };
    }
    const { headers, rows } = await this.buildRows(user, reportType, params, sensitive);
    return { headers, rows, rowCount: rows.length };
  }

  async get(user: AuthUser, id: string) {
    const job = await this.prisma.reportJob.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!job) throw Errors.notFound('Report job');
    return job;
  }

  list(user: AuthUser, type?: string) {
    return this.prisma.reportJob.findMany({
      where: { organizationId: user.organizationId, ...(type ? { reportType: type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---- Row builders --------------------------------------------------------
  private async buildRows(
    user: AuthUser,
    type: ReportType,
    params: Record<string, unknown>,
    sensitive = false,
  ): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
    const org = user.organizationId;

    if (type === ReportType.CORRECTION) {
      const reqs = await this.prisma.correctionRequest.findMany({
        where: { organizationId: org },
        include: { worker: true },
        orderBy: { createdAt: 'desc' },
      });
      return {
        headers: ['Date', 'Worker', 'Type', 'Reason', 'Status', 'Reviewed At'],
        rows: reqs.map((r) => [
          r.workDate.toISOString().slice(0, 10),
          r.worker.fullName,
          r.type,
          r.reason,
          r.status,
          r.reviewedAt ? r.reviewedAt.toISOString() : null,
        ]),
      };
    }

    // Attendance-session based reports share a query shape.
    const where: Prisma.AttendanceSessionWhereInput = { organizationId: org };
    if (params.siteId) where.siteId = String(params.siteId);
    if (params.workerId) where.workerId = String(params.workerId);
    // vendor and/or person-type (WORKER/STAFF/VISITOR) filters on the worker.
    const workerFilter: Prisma.WorkerWhereInput = {};
    if (params.vendorId) workerFilter.vendorId = String(params.vendorId);
    if (params.category)
      workerFilter.category = String(params.category) as Prisma.WorkerWhereInput['category'];
    if (Object.keys(workerFilter).length) where.worker = workerFilter;
    if (type === ReportType.DAILY && params.date) {
      where.workDate = new Date(String(params.date));
    }
    // Weekly: params.weekStart is the Monday of the week; the range runs the
    // seven days from there, so the admin only ever picks one date.
    if (type === ReportType.WEEKLY && params.weekStart) {
      const start = new Date(`${String(params.weekStart)}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      where.workDate = { gte: start, lt: end };
    }
    if (type === ReportType.MONTHLY && params.month) {
      const [y, m] = String(params.month)
        .split('-')
        .map((n) => parseInt(n, 10));
      where.workDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }
    // from/to carry full date-times — filter on the actual login timestamp so
    // time-of-day selections in the admin panel are honoured.
    if ((params.from || params.to) && !where.workDate) {
      where.loginAt = {
        ...(params.from ? { gte: new Date(String(params.from)) } : {}),
        ...(params.to ? { lte: new Date(String(params.to)) } : {}),
      };
    }
    if (type === ReportType.OVERTIME) {
      where.overtimeMinutes = { gt: 0 };
    }

    // Workers always come first, then staff, then visitors. Within a category,
    // optional vendor-wise sorting (params.sortBy === 'vendor'), then chronology.
    const vendorSort = params.sortBy === 'vendor';
    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: { worker: { include: { vendor: true, designation: true } }, site: true },
      orderBy: [
        { worker: { category: 'asc' } },
        ...(vendorSort
          ? [
              {
                worker: { vendor: { name: 'asc' } },
              } as Prisma.AttendanceSessionOrderByWithRelationInput,
            ]
          : []),
        { workDate: 'asc' },
        { loginAt: 'asc' },
      ],
    });

    const sensitiveHeaders = [
      "Father's Name",
      'DOB',
      'Gender',
      'Blood Group',
      'Mobile',
      'Aadhaar',
      'PAN',
      'Bank Name',
      'Bank Account',
      'IFSC',
      'PF No',
      'ESI No',
      'Emergency Contact',
      'Emergency Number',
      'Join Date',
    ];
    const headers = [
      'Date',
      'Worker Code',
      'Worker',
      'Category',
      'Designation',
      'Vendor',
      'Site',
      'Login',
      'Logout',
      'Worked (h)',
      'Overtime (h)',
      'Late (min)',
      'State',
      ...(sensitive ? sensitiveHeaders : []),
    ];

    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const sensitiveCells = (w: (typeof sessions)[number]['worker']): (string | number | null)[] => [
      w.fatherName ?? '',
      day(w.dateOfBirth),
      w.gender ?? '',
      w.bloodGroup ?? '',
      w.mobileNumber ?? '',
      this.decryptOrBlank(w.aadhaarCiphertext),
      this.decryptOrBlank(w.panCiphertext),
      w.bankName ?? '',
      this.decryptOrBlank(w.bankAccountCiphertext) || (w.bankAccountNumber ?? ''),
      w.ifscCode ?? '',
      w.pfNumber ?? '',
      w.esiNumber ?? '',
      w.emergencyContactName ?? '',
      w.emergencyContactNumber ?? '',
      day(w.joinDate),
    ];

    // Compliance mode: a day that ran past the statutory 9 hours — usually a
    // missed logout — is trimmed back to it before the row is written.
    const capHours = params.capHours === true || params.capHours === 'true';

    const toRow = (s: (typeof sessions)[number]): (string | number | null)[] => {
      const t = capHours ? capSessionHours(s) : s;
      return [
        s.workDate.toISOString().slice(0, 10),
        s.worker.workerCode,
        s.worker.fullName,
        s.worker.category,
        s.worker.designation?.name ?? '',
        s.worker.vendor?.name ?? '',
        s.site.name,
        s.loginAt ? s.loginAt.toISOString() : null,
        t.logoutAt ? t.logoutAt.toISOString() : null,
        minutesToHours(t.workedMinutes),
        minutesToHours(t.overtimeMinutes),
        s.lateMinutes ?? 0,
        s.state,
        ...(sensitive ? sensitiveCells(s.worker) : []),
      ];
    };

    // Insert a section divider row when the report spans multiple categories
    // (e.g. "===== WORKERS =====" then "===== STAFF =====").
    const categories = new Set(sessions.map((s) => s.worker.category));
    if (categories.size <= 1) {
      return { headers, rows: sessions.map(toRow) };
    }

    const sectionLabel: Record<string, string> = {
      WORKER: '===== WORKERS =====',
      STAFF: '===== STAFF =====',
      VISITOR: '===== VISITORS =====',
    };
    const rows: (string | number | null)[][] = [];
    let current: string | null = null;
    for (const s of sessions) {
      if (s.worker.category !== current) {
        current = s.worker.category;
        rows.push([sectionLabel[current] ?? current, ...Array(headers.length - 1).fill('')]);
      }
      rows.push(toRow(s));
    }
    return { headers, rows };
  }

  /**
   * Build the attendance grid: every worker as a row, with IN/Out times per day.
   * Accepts a single `month` (YYYY-MM, whole month) or a `from`/`to` date range —
   * which may be a few days or span several months (each month becomes a block,
   * clamped to the selected days).
   */
  private async buildAttendanceSheet(
    user: AuthUser,
    params: Record<string, unknown>,
    sensitive = false,
  ) {
    const orgId = user.organizationId;
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const tz = org?.timezone || 'Asia/Kolkata';

    // Resolve the list of month blocks to render.
    const monthName = (y: number, m: number) =>
      new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(Date.UTC(y, m - 1, 1)),
      );
    const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const range = (a: number, b: number) => {
      const out: number[] = [];
      for (let d = a; d <= b; d++) out.push(d);
      return out;
    };
    // Each block is a (possibly partial) month with the exact day numbers to show.
    const blocks: { year: number; month: number; label: string; days: number[] }[] = [];
    if (params.month) {
      const [y, m] = String(params.month)
        .split('-')
        .map((n) => parseInt(n, 10));
      blocks.push({ year: y, month: m, label: monthName(y, m), days: range(1, daysInMonth(y, m)) });
    } else {
      let from = params.from ? new Date(String(params.from)) : new Date();
      let to = params.to ? new Date(String(params.to)) : from;
      if (from > to) [from, to] = [to, from]; // tolerate a reversed range
      const startY = from.getUTCFullYear();
      const startM = from.getUTCMonth() + 1;
      const startD = from.getUTCDate();
      const endY = to.getUTCFullYear();
      const endM = to.getUTCMonth() + 1;
      const endD = to.getUTCDate();
      let y = startY;
      let m = startM;
      while ((y < endY || (y === endY && m <= endM)) && blocks.length < 24) {
        const firstDay = y === startY && m === startM ? startD : 1;
        const lastDay = y === endY && m === endM ? endD : daysInMonth(y, m);
        const days = range(firstDay, lastDay);
        if (days.length) blocks.push({ year: y, month: m, label: monthName(y, m), days });
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
    if (blocks.length === 0) {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      blocks.push({ year: y, month: m, label: monthName(y, m), days: range(1, daysInMonth(y, m)) });
    }
    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    const periodStart = new Date(
      Date.UTC(firstBlock.year, firstBlock.month - 1, firstBlock.days[0]),
    );
    const periodEnd = new Date(
      Date.UTC(lastBlock.year, lastBlock.month - 1, lastBlock.days[lastBlock.days.length - 1] + 1),
    ); // exclusive

    // Workers (the workforce — exclude visitors), with optional vendor/site filters.
    const where: Prisma.WorkerWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      // Default to the workforce (workers + staff); a Person-type filter narrows it.
      category: params.category
        ? (String(params.category) as Prisma.WorkerWhereInput['category'])
        : { in: ['WORKER', 'STAFF'] },
    };
    if (params.vendorId) where.vendorId = String(params.vendorId);
    if (params.siteId) {
      where.assignments = { some: { siteId: String(params.siteId), endDate: null } };
    }
    const workers = await this.prisma.worker.findMany({
      where,
      include: { vendor: true },
      orderBy: [{ category: 'asc' }, { fullName: 'asc' }],
    });

    // Per-worker, per-day first IN / last Out across the whole period.
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        organizationId: orgId,
        workerId: { in: workers.map((w) => w.id) },
        workDate: { gte: periodStart, lt: periodEnd },
      },
      select: { workerId: true, workDate: true, loginAt: true, logoutAt: true },
    });
    const byWorkerDay = new Map<string, Map<string, { inAt: Date | null; outAt: Date | null }>>();
    for (const s of sessions) {
      const dkey = s.workDate.toISOString().slice(0, 10);
      let wm = byWorkerDay.get(s.workerId);
      if (!wm) {
        wm = new Map();
        byWorkerDay.set(s.workerId, wm);
      }
      let e = wm.get(dkey);
      if (!e) {
        e = { inAt: null, outAt: null };
        wm.set(dkey, e);
      }
      if (s.loginAt && (!e.inAt || s.loginAt < e.inAt)) e.inAt = s.loginAt;
      if (s.logoutAt && (!e.outAt || s.logoutAt > e.outAt)) e.outAt = s.logoutAt;
    }

    const timeFmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    const fmtTime = (d: Date | null) => (d ? timeFmt.format(d) : null);
    const dateFmt = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const fmtDate = (d: Date | null) => (d ? dateFmt.format(d) : '');
    const sex = (g: string | null) => (g === 'M' ? 'Male' : g === 'F' ? 'Female' : (g ?? ''));

    // Extra joining/sensitive columns appended to the info block for the full
    // profile report (demographics like Father's Name/DOB are already present).
    const sensitiveInfoHeaders = [
      'Blood Group',
      'Aadhaar',
      'PAN',
      'Bank Name',
      'Bank Account',
      'IFSC',
      'PF No',
      'ESI No',
      'Emergency Contact',
      'Emergency Number',
    ];
    const infoHeaders = [
      'SL No',
      'Workers Name',
      "Father's Name",
      'EMP - ID NO',
      'Contractor',
      'Nature of Contractor',
      'DOB',
      'Date of Joining',
      'Gender',
      'Mobile number',
      ...(sensitive ? sensitiveInfoHeaders : []),
    ];

    const months: AttSheetMonth[] = blocks.map((b) => ({ label: b.label, days: b.days }));

    // PRESENCE mode: one column per day with P (present) / A (absent), blank for
    // days the worker wasn't employed. TIMES mode (default): IN/Out per day.
    const presence = String(params.attendanceMode ?? '').toUpperCase() === 'PRESENCE';
    const dkeyOf = (w: { joinDate: Date | null; exitDate: Date | null }) => ({
      join: w.joinDate ? w.joinDate.toISOString().slice(0, 10) : null,
      exit: w.exitDate ? w.exitDate.toISOString().slice(0, 10) : null,
    });

    const rows: AttSheetRow[] = workers.map((w, idx) => {
      const wm = byWorkerDay.get(w.id);
      const info: (string | number | null)[] = [
        idx + 1,
        w.fullName,
        w.fatherName ?? '',
        w.workerCode,
        w.vendor?.name ?? '',
        w.natureOfContractor ?? '',
        fmtDate(w.dateOfBirth),
        fmtDate(w.joinDate),
        sex(w.gender),
        w.mobileNumber ?? '',
        ...(sensitive
          ? [
              w.bloodGroup ?? '',
              this.decryptOrBlank(w.aadhaarCiphertext),
              this.decryptOrBlank(w.panCiphertext),
              w.bankName ?? '',
              this.decryptOrBlank(w.bankAccountCiphertext) || (w.bankAccountNumber ?? ''),
              w.ifscCode ?? '',
              w.pfNumber ?? '',
              w.esiNumber ?? '',
              w.emergencyContactName ?? '',
              w.emergencyContactNumber ?? '',
            ]
          : []),
      ];
      const cells: (string | null)[] = [];
      const emp = dkeyOf(w);
      for (const b of blocks) {
        for (const day of b.days) {
          const dkey = `${b.year}-${String(b.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const e = wm?.get(dkey);
          if (presence) {
            const employed = (!emp.join || dkey >= emp.join) && (!emp.exit || dkey <= emp.exit);
            cells.push(employed ? (e ? 'P' : 'A') : '');
          } else {
            cells.push(fmtTime(e?.inAt ?? null));
            cells.push(fmtTime(e?.outAt ?? null));
          }
        }
      }
      return { info, cells };
    });

    // Flat representation for the preview table and CSV/PDF exports.
    const flatHeaders = [...infoHeaders];
    for (const b of blocks) {
      for (const day of b.days) {
        if (presence) {
          flatHeaders.push(`${b.label} ${day}`);
        } else {
          flatHeaders.push(`${b.label} ${day} IN`);
          flatHeaders.push(`${b.label} ${day} Out`);
        }
      }
    }
    const flatRows = rows.map((r) => [...r.info, ...r.cells]);

    return { months, infoHeaders, rows, flatHeaders, flatRows, presence };
  }
}
