import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { minutesToHours, toCsv } from './report.builder';
import { CreateReportDto, ReportType } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a report. CSV is produced inline (dependency-free). XLSX/PDF jobs
   * are queued for a worker to render from the same row data (see worker.ts);
   * here we persist the job and return CSV content immediately for CSV requests.
   */
  async create(user: AuthUser, dto: CreateReportDto) {
    const params = dto.params ?? {};
    const { headers, rows } = await this.buildRows(user, dto.reportType, params);
    const csv = toCsv(headers, rows);

    const job = await this.prisma.reportJob.create({
      data: {
        organizationId: user.organizationId,
        requestedBy: user.userId,
        reportType: dto.reportType,
        format: dto.format,
        params: params as Prisma.InputJsonValue,
        status: dto.format === 'CSV' ? 'DONE' : 'QUEUED',
        completedAt: dto.format === 'CSV' ? new Date() : null,
      },
    });

    return {
      jobId: job.id,
      status: job.status,
      // CSV returned inline; XLSX/PDF will be available via GET /reports/:id once rendered.
      ...(dto.format === 'CSV' ? { contentType: 'text/csv', content: csv, rowCount: rows.length } : {}),
    };
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
    if (params.vendorId) where.worker = { vendorId: String(params.vendorId) };
    if (type === ReportType.DAILY && params.date) {
      where.workDate = new Date(String(params.date));
    }
    if (type === ReportType.MONTHLY && params.month) {
      const [y, m] = String(params.month).split('-').map((n) => parseInt(n, 10));
      where.workDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }
    if ((params.from || params.to) && !where.workDate) {
      where.workDate = {
        ...(params.from ? { gte: new Date(String(params.from)) } : {}),
        ...(params.to ? { lte: new Date(String(params.to)) } : {}),
      };
    }
    if (type === ReportType.OVERTIME) {
      where.overtimeMinutes = { gt: 0 };
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: { worker: { include: { vendor: true } }, site: true },
      orderBy: [{ workDate: 'asc' }, { loginAt: 'asc' }],
    });

    return {
      headers: [
        'Date',
        'Worker Code',
        'Worker',
        'Vendor',
        'Site',
        'Login',
        'Logout',
        'Worked (h)',
        'Overtime (h)',
        'Late (min)',
        'State',
      ],
      rows: sessions.map((s) => [
        s.workDate.toISOString().slice(0, 10),
        s.worker.workerCode,
        s.worker.fullName,
        s.worker.vendor?.name ?? '',
        s.site.name,
        s.loginAt ? s.loginAt.toISOString() : null,
        s.logoutAt ? s.logoutAt.toISOString() : null,
        minutesToHours(s.workedMinutes),
        minutesToHours(s.overtimeMinutes),
        s.lateMinutes ?? 0,
        s.state,
      ]),
    };
  }
}
