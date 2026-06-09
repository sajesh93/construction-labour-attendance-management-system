import { Injectable } from '@nestjs/common';
import { SyncEventStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AttendanceService, TapContext } from './attendance.service';
import { AppException } from '../../common/errors/app.exception';
import { TapDto } from './dto/attendance.dto';

export interface EventResult {
  eventId: string;
  status: SyncEventStatus;
  detail?: string;
  tapId?: string;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * Ingest an offline batch. Each event is processed independently through the
   * same idempotent tap handler. One bad event never fails the whole batch —
   * it is recorded as CONFLICT/REJECTED and surfaced back to the device.
   */
  async ingest(organizationId: string, deviceId: string, events: TapDto[], ctx: TapContext) {
    const results: EventResult[] = [];

    for (const event of events) {
      try {
        const res = await this.attendance.handleTap(organizationId, event, ctx);
        if (res.result === 'IDEMPOTENT_REPLAY') {
          results.push({ eventId: event.eventId, status: 'DUPLICATE' });
        } else {
          results.push({
            eventId: event.eventId,
            status: 'ACCEPTED',
            tapId: 'tapId' in res ? (res.tapId as string) : undefined,
          });
        }
      } catch (err) {
        if (err instanceof AppException) {
          if (err.code === 'DUPLICATE_TAP') {
            results.push({ eventId: event.eventId, status: 'DUPLICATE', detail: err.title });
          } else if (err.code === 'WORKER_NOT_FOUND' || err.code === 'CONFLICT') {
            results.push({ eventId: event.eventId, status: 'CONFLICT', detail: err.title });
          } else {
            results.push({ eventId: event.eventId, status: 'REJECTED', detail: err.title });
          }
        } else {
          results.push({ eventId: event.eventId, status: 'REJECTED', detail: 'internal error' });
        }
      }
    }

    const summary = {
      accepted: results.filter((r) => r.status === 'ACCEPTED').length,
      duplicates: results.filter((r) => r.status === 'DUPLICATE').length,
      conflicts: results.filter((r) => r.status === 'CONFLICT').length,
      rejected: results.filter((r) => r.status === 'REJECTED').length,
    };

    const batch = await this.prisma.syncBatch.create({
      data: {
        deviceId,
        eventCount: events.length,
        accepted: summary.accepted,
        duplicates: summary.duplicates,
        conflicts: summary.conflicts,
        rejected: summary.rejected,
        events: {
          create: results.map((r) => ({
            eventId: r.eventId,
            status: r.status,
            detail: r.detail,
            tapId: r.tapId,
          })),
        },
      },
    });

    return { batchId: batch.id, summary, results };
  }
}
