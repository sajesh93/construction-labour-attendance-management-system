import { Injectable } from '@nestjs/common';
import { CredentialKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import {
  AssignSiteDto,
  BindCredentialDto,
  CreateWorkerDto,
  ExitWorkerDto,
  RehireWorkerDto,
  UpdateWorkerDto,
} from './dto/worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // ---- Shapers -------------------------------------------------------------
  private limitedCard(w: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    bloodGroup: string | null;
    emergencyContactName: string | null;
    emergencyContactNumber: string | null;
    workerCode: string;
  }) {
    return {
      id: w.id,
      workerCode: w.workerCode,
      fullName: w.fullName,
      photoUrl: w.photoUrl,
      bloodGroup: w.bloodGroup,
      emergencyContactName: w.emergencyContactName,
      emergencyContactNumber: w.emergencyContactNumber,
    };
  }

  // ---- Queries -------------------------------------------------------------
  async list(
    user: AuthUser,
    opts: { siteId?: string; vendorId?: string; status?: string; q?: string; limit?: number; cursor?: string },
  ) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: Prisma.WorkerWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.status ? { status: opts.status as Prisma.EnumWorkerStatusFilter['equals'] } : {}),
      ...(opts.siteId
        ? { assignments: { some: { siteId: opts.siteId, endDate: null } } }
        : {}),
      ...(opts.q
        ? {
            OR: [
              { fullName: { contains: opts.q, mode: 'insensitive' } },
              { workerCode: { contains: opts.q, mode: 'insensitive' } },
              { mobileNumber: { contains: opts.q } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.worker.findMany({
      where,
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workerCode: true,
        fullName: true,
        photoUrl: true,
        mobileNumber: true,
        status: true,
        vendorId: true,
        bloodGroup: true,
        emergencyContactName: true,
        emergencyContactNumber: true,
      },
    });
    const nextCursor = rows.length > limit ? rows[limit].id : null;
    return { data: rows.slice(0, limit), nextCursor };
  }

  /** Full profile. Aadhaar is decrypted only when reveal=true and is audited. */
  async get(user: AuthUser, id: string, reveal = false) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        vendor: true,
        assignments: { where: { endDate: null }, include: { site: true } },
        credentials: { where: { isActive: true } },
      },
    });
    if (!worker) throw Errors.workerNotFound();

    let aadhaar: string | undefined;
    if (reveal && worker.aadhaarCiphertext) {
      aadhaar = this.crypto.decrypt(Buffer.from(worker.aadhaarCiphertext));
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'WORKER_AADHAAR_REVEAL',
        entityType: 'Worker',
        entityId: id,
      });
    }

    const { aadhaarCiphertext: _omit, ...rest } = worker;
    void _omit;
    return { ...rest, aadhaar };
  }

  // ---- Mutations -----------------------------------------------------------
  async create(user: AuthUser, dto: CreateWorkerDto) {
    const aadhaarCiphertext = dto.aadhaar ? this.crypto.encrypt(dto.aadhaar) : undefined;
    const aadhaarLast4 = dto.aadhaar ? dto.aadhaar.slice(-4) : undefined;

    const worker = await this.prisma.$transaction(async (tx) => {
      const w = await tx.worker.create({
        data: {
          organizationId: user.organizationId,
          workerCode: dto.workerCode,
          fullName: dto.fullName,
          mobileNumber: dto.mobileNumber,
          bloodGroup: dto.bloodGroup,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactNumber: dto.emergencyContactNumber,
          vendorId: dto.vendorId,
          pfNumber: dto.pfNumber,
          esiNumber: dto.esiNumber,
          aadhaarCiphertext,
          aadhaarLast4,
          joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
          notes: dto.notes,
          nfcUid: dto.nfcUid,
          qrIdentifier: dto.qrIdentifier,
          photoUrl: dto.photoUrl,
        },
      });

      if (dto.nfcUid) {
        await tx.workerCredential.create({
          data: { workerId: w.id, kind: 'NFC_UID', value: dto.nfcUid },
        });
      }
      if (dto.qrIdentifier) {
        await tx.workerCredential.create({
          data: { workerId: w.id, kind: 'QR', value: dto.qrIdentifier },
        });
      }
      if (dto.siteId) {
        await tx.workerSiteAssignment.create({
          data: {
            workerId: w.id,
            siteId: dto.siteId,
            vendorId: dto.vendorId,
            startDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
          },
        });
      }
      return w;
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_CREATE',
      entityType: 'Worker',
      entityId: worker.id,
      newValue: { workerCode: worker.workerCode, fullName: worker.fullName },
    });
    return this.get(user, worker.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateWorkerDto) {
    const before = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!before) throw Errors.workerNotFound();

    const data: Prisma.WorkerUpdateInput = {
      fullName: dto.fullName,
      mobileNumber: dto.mobileNumber,
      bloodGroup: dto.bloodGroup,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactNumber: dto.emergencyContactNumber,
      pfNumber: dto.pfNumber,
      esiNumber: dto.esiNumber,
      notes: dto.notes,
      photoUrl: dto.photoUrl,
      status: dto.status,
      ...(dto.vendorId ? { vendor: { connect: { id: dto.vendorId } } } : {}),
    };
    if (dto.aadhaar) {
      data.aadhaarCiphertext = this.crypto.encrypt(dto.aadhaar);
      data.aadhaarLast4 = dto.aadhaar.slice(-4);
    }

    await this.prisma.worker.update({ where: { id }, data });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_UPDATE',
      entityType: 'Worker',
      entityId: id,
      oldValue: { fullName: before.fullName, status: before.status },
      newValue: { fullName: dto.fullName ?? before.fullName, status: dto.status ?? before.status },
    });
    return this.get(user, id);
  }

  async softDelete(user: AuthUser, id: string) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!worker) throw Errors.workerNotFound();

    await this.prisma.$transaction([
      // Free UID/QR from active-uniqueness and clear credentials.
      this.prisma.worker.update({
        where: { id },
        data: { deletedAt: new Date(), nfcUid: null, qrIdentifier: null, status: 'INACTIVE' },
      }),
      this.prisma.workerCredential.updateMany({
        where: { workerId: id, isActive: true },
        data: { isActive: false, revokedAt: new Date(), reason: 'worker deleted' },
      }),
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_DELETE',
      entityType: 'Worker',
      entityId: id,
      oldValue: { status: worker.status },
    });
    return { deleted: true };
  }

  /** Bind a credential (UID/QR), revoking any prior active of the same kind. */
  async bindCredential(user: AuthUser, id: string, dto: BindCredentialDto) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!worker) throw Errors.workerNotFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.workerCredential.updateMany({
        where: { workerId: id, kind: dto.kind, isActive: true },
        data: { isActive: false, revokedAt: new Date(), reason: dto.reason ?? 'reissued' },
      });
      await tx.workerCredential.create({
        data: { workerId: id, kind: dto.kind, value: dto.value },
      });
      await tx.worker.update({
        where: { id },
        data:
          dto.kind === CredentialKind.NFC_UID
            ? { nfcUid: dto.value }
            : { qrIdentifier: dto.value },
      });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_CREDENTIAL_BIND',
      entityType: 'Worker',
      entityId: id,
      newValue: { kind: dto.kind },
      reason: dto.reason,
    });
    return this.get(user, id);
  }

  async assignSite(user: AuthUser, id: string, dto: AssignSiteDto) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!worker) throw Errors.workerNotFound();

    await this.prisma.$transaction([
      // Close current primary assignment.
      this.prisma.workerSiteAssignment.updateMany({
        where: { workerId: id, endDate: null },
        data: { endDate: new Date(dto.startDate) },
      }),
      this.prisma.workerSiteAssignment.create({
        data: {
          workerId: id,
          siteId: dto.siteId,
          vendorId: dto.vendorId,
          startDate: new Date(dto.startDate),
        },
      }),
      ...(dto.vendorId
        ? [this.prisma.worker.update({ where: { id }, data: { vendorId: dto.vendorId } })]
        : []),
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_ASSIGN_SITE',
      entityType: 'Worker',
      entityId: id,
      newValue: { siteId: dto.siteId, vendorId: dto.vendorId },
    });
    return this.get(user, id);
  }

  async exit(user: AuthUser, id: string, dto: ExitWorkerDto) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!worker) throw Errors.workerNotFound();

    await this.prisma.$transaction([
      this.prisma.worker.update({
        where: { id },
        data: { status: 'EXITED', exitDate: new Date(dto.exitDate) },
      }),
      this.prisma.workerSiteAssignment.updateMany({
        where: { workerId: id, endDate: null },
        data: { endDate: new Date(dto.exitDate) },
      }),
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_EXIT',
      entityType: 'Worker',
      entityId: id,
      newValue: { exitDate: dto.exitDate },
      reason: dto.reason,
    });
    return this.get(user, id);
  }

  async rehire(user: AuthUser, id: string, dto: RehireWorkerDto) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!worker) throw Errors.workerNotFound();

    await this.prisma.$transaction([
      this.prisma.worker.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          exitDate: null,
          deletedAt: null,
          joinDate: new Date(dto.joinDate),
          vendorId: dto.vendorId ?? worker.vendorId,
        },
      }),
      this.prisma.workerSiteAssignment.create({
        data: {
          workerId: id,
          siteId: dto.siteId,
          vendorId: dto.vendorId,
          startDate: new Date(dto.joinDate),
        },
      }),
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'WORKER_REHIRE',
      entityType: 'Worker',
      entityId: id,
      newValue: { joinDate: dto.joinDate, siteId: dto.siteId },
    });
    return this.get(user, id);
  }

  // ---- Lookup / search / emergency ----------------------------------------
  async lookup(user: AuthUser, by: { uid?: string; qr?: string; code?: string }) {
    const where: Prisma.WorkerWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(by.uid ? { nfcUid: by.uid } : {}),
      ...(by.qr ? { qrIdentifier: by.qr } : {}),
      ...(by.code ? { workerCode: by.code } : {}),
    };
    if (!by.uid && !by.qr && !by.code) {
      throw Errors.validation({ message: 'Provide one of uid, qr or code' });
    }
    const worker = await this.prisma.worker.findFirst({ where });
    if (!worker) throw Errors.workerNotFound();
    return this.limitedCard(worker);
  }

  async search(user: AuthUser, q: string) {
    if (!q || q.length < 2) throw Errors.validation({ message: 'q must be at least 2 chars' });
    const rows = await this.prisma.worker.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { workerCode: { contains: q, mode: 'insensitive' } },
          { mobileNumber: { contains: q } },
        ],
      },
      take: 25,
    });
    return rows.map((w) => this.limitedCard(w));
  }

  async emergency(user: AuthUser, id: string) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true,
        fullName: true,
        bloodGroup: true,
        emergencyContactName: true,
        emergencyContactNumber: true,
      },
    });
    if (!worker) throw Errors.workerNotFound();
    return worker;
  }
}
