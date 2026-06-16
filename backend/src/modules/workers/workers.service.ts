import { Injectable } from '@nestjs/common';
import { CredentialKind, PersonCategory, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
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
    category?: PersonCategory;
    vendor?: { name: string } | null;
    designation?: { name: string } | null;
  }) {
    return {
      id: w.id,
      workerCode: w.workerCode,
      fullName: w.fullName,
      photoUrl: w.photoUrl,
      bloodGroup: w.bloodGroup,
      emergencyContactName: w.emergencyContactName,
      emergencyContactNumber: w.emergencyContactNumber,
      category: w.category ?? 'WORKER',
      vendorName: w.vendor?.name ?? null,
      designationName: w.designation?.name ?? null,
    };
  }

  /** Auto-generate a unique code: W-0001 (workers), S-0001 (staff), V-0001 (visitors). */
  private async generateWorkerCode(organizationId: string, category: PersonCategory) {
    const prefix = category === 'STAFF' ? 'S' : category === 'VISITOR' ? 'V' : 'W';
    const count = await this.prisma.worker.count({ where: { organizationId, category } });
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = `${prefix}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const exists = await this.prisma.worker.findFirst({
        where: { organizationId, workerCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  // ---- Queries -------------------------------------------------------------
  async list(
    user: AuthUser,
    opts: {
      siteId?: string;
      vendorId?: string;
      status?: string;
      q?: string;
      limit?: number;
      cursor?: string;
      category?: string;
      sortBy?: string;
    },
  ) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: Prisma.WorkerWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(opts.category ? { category: opts.category as PersonCategory } : {}),
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.status ? { status: opts.status as Prisma.EnumWorkerStatusFilter['equals'] } : {}),
      ...(opts.siteId ? { assignments: { some: { siteId: opts.siteId, endDate: null } } } : {}),
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

    // Stable sort orders (id tiebreaker keeps cursor pagination consistent).
    const orderBy: Prisma.WorkerOrderByWithRelationInput[] =
      opts.sortBy === 'designation'
        ? [{ designation: { name: 'asc' } }, { fullName: 'asc' }, { id: 'asc' }]
        : opts.sortBy === 'vendor'
          ? [{ vendor: { name: 'asc' } }, { fullName: 'asc' }, { id: 'asc' }]
          : opts.sortBy === 'name'
            ? [{ fullName: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }];

    const rows = await this.prisma.worker.findMany({
      where,
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      orderBy,
      select: {
        id: true,
        workerCode: true,
        fullName: true,
        fatherName: true,
        gender: true,
        photoUrl: true,
        mobileNumber: true,
        status: true,
        vendorId: true,
        vendor: { select: { name: true } },
        category: true,
        designationId: true,
        designation: { select: { name: true } },
        natureOfContractor: true,
        pfNumber: true,
        esiNumber: true,
        govIdType: true,
        aadhaarLast4: true,
        panLast4: true,
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
        designation: true,
        assignments: { where: { endDate: null }, include: { site: true } },
        credentials: { where: { isActive: true } },
      },
    });
    if (!worker) throw Errors.workerNotFound();

    let aadhaar: string | undefined;
    let pan: string | undefined;
    if (reveal && (worker.aadhaarCiphertext || worker.panCiphertext)) {
      if (worker.aadhaarCiphertext) {
        aadhaar = this.crypto.decrypt(Buffer.from(worker.aadhaarCiphertext));
      }
      if (worker.panCiphertext) {
        pan = this.crypto.decrypt(Buffer.from(worker.panCiphertext));
      }
      await this.audit.record({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'WORKER_AADHAAR_REVEAL',
        entityType: 'Worker',
        entityId: id,
      });
    }

    const { aadhaarCiphertext: _omit, panCiphertext: _omit2, ...rest } = worker;
    void _omit;
    void _omit2;
    return { ...rest, aadhaar, pan };
  }

  // ---- Mutations -----------------------------------------------------------
  async create(user: AuthUser, dto: CreateWorkerDto) {
    const category = dto.category ?? 'WORKER';
    // Visitors are day passes — default the visit date to today so the pass
    // can auto-expire at end of day.
    const joinDate = dto.joinDate
      ? new Date(dto.joinDate)
      : category === 'VISITOR'
        ? new Date()
        : undefined;

    // Retry on the (rare) auto-ID race: two simultaneous creates can pick the
    // same next number; regenerate and try again.
    let worker: { id: string; workerCode: string; fullName: string } | null = null;
    for (let attempt = 0; worker === null; attempt++) {
      const workerCode =
        dto.workerCode?.trim() || (await this.generateWorkerCode(user.organizationId, category));
      try {
        worker = await this.createWithCode(user, dto, category, workerCode, joinDate);
      } catch (e) {
        const isUnique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (isUnique && !dto.workerCode && attempt < 3) continue;
        if (isUnique) throw Errors.conflict(`ID "${workerCode}" is already in use`);
        throw e;
      }
    }

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

  private async createWithCode(
    user: AuthUser,
    dto: CreateWorkerDto,
    category: PersonCategory,
    workerCode: string,
    joinDate: Date | undefined,
  ) {
    const aadhaarCiphertext = dto.aadhaar ? this.crypto.encrypt(dto.aadhaar) : undefined;
    const aadhaarLast4 = dto.aadhaar ? dto.aadhaar.replace(/\s/g, '').slice(-4) : undefined;
    const pan = dto.pan?.replace(/\s/g, '').toUpperCase();
    const panCiphertext = pan ? this.crypto.encrypt(pan) : undefined;
    const panLast4 = pan ? pan.slice(-4) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const w = await tx.worker.create({
        data: {
          organizationId: user.organizationId,
          workerCode,
          category,
          designationId: dto.designationId || undefined,
          createdById: user.userId,
          updatedById: user.userId,
          fullName: dto.fullName,
          fatherName: dto.fatherName,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          language: dto.language,
          pincode: dto.pincode,
          mobileNumber: dto.mobileNumber,
          bloodGroup: dto.bloodGroup,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactNumber: dto.emergencyContactNumber,
          nomineeName: dto.nomineeName,
          nomineeRelation: dto.nomineeRelation,
          vendorId: dto.vendorId,
          natureOfContractor: dto.natureOfContractor,
          bankName: dto.bankName,
          bankAccountNumber: dto.bankAccountNumber,
          ifscCode: dto.ifscCode,
          pfNumber: dto.pfNumber,
          esiNumber: dto.esiNumber,
          govIdType: dto.govIdType,
          aadhaarCiphertext,
          aadhaarLast4,
          panCiphertext,
          panLast4,
          joinDate,
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
            startDate: joinDate ?? new Date(),
          },
        });
      }
      return w;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateWorkerDto) {
    const before = await this.prisma.worker.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!before) throw Errors.workerNotFound();

    const data: Prisma.WorkerUpdateInput = {
      fullName: dto.fullName,
      fatherName: dto.fatherName,
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      language: dto.language,
      pincode: dto.pincode,
      mobileNumber: dto.mobileNumber,
      bloodGroup: dto.bloodGroup,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactNumber: dto.emergencyContactNumber,
      nomineeName: dto.nomineeName,
      nomineeRelation: dto.nomineeRelation,
      natureOfContractor: dto.natureOfContractor,
      bankName: dto.bankName,
      bankAccountNumber: dto.bankAccountNumber,
      ifscCode: dto.ifscCode,
      pfNumber: dto.pfNumber,
      esiNumber: dto.esiNumber,
      govIdType: dto.govIdType,
      notes: dto.notes,
      photoUrl: dto.photoUrl,
      status: dto.status,
      category: dto.category,
      updatedById: user.userId,
      ...(dto.vendorId ? { vendor: { connect: { id: dto.vendorId } } } : {}),
      ...(dto.designationId !== undefined
        ? dto.designationId
          ? { designation: { connect: { id: dto.designationId } } }
          : { designation: { disconnect: true } }
        : {}),
    };
    if (dto.aadhaar) {
      data.aadhaarCiphertext = this.crypto.encrypt(dto.aadhaar);
      data.aadhaarLast4 = dto.aadhaar.replace(/\s/g, '').slice(-4);
    }
    if (dto.pan) {
      const pan = dto.pan.replace(/\s/g, '').toUpperCase();
      data.panCiphertext = this.crypto.encrypt(pan);
      data.panLast4 = pan.slice(-4);
    }

    await this.prisma.worker.update({ where: { id }, data });
    // Drop the previous photo blob when the photo changed (avoids DB bloat).
    if (dto.photoUrl !== undefined && before.photoUrl && before.photoUrl !== dto.photoUrl) {
      await this.deletePhotoBlobIfOrphan(user.organizationId, before.photoUrl);
    }
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

    await this.deletePhotoBlobIfOrphan(user.organizationId, worker.photoUrl);

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

  /** Deletes a /files/<id> photo blob once no worker references it anymore. */
  private async deletePhotoBlobIfOrphan(organizationId: string, url: string | null) {
    if (!url || !url.startsWith('/files/')) return;
    const blobId = url.slice('/files/'.length);
    const stillUsed = await this.prisma.worker.count({ where: { photoUrl: url } });
    if (stillUsed === 0) {
      await this.prisma.photoBlob
        .deleteMany({ where: { id: blobId, organizationId } })
        .catch(() => undefined);
    }
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
          dto.kind === CredentialKind.NFC_UID ? { nfcUid: dto.value } : { qrIdentifier: dto.value },
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
    const worker = await this.prisma.worker.findFirst({
      where,
      include: { vendor: { select: { name: true } }, designation: { select: { name: true } } },
    });
    if (!worker) throw Errors.workerNotFound();
    return this.limitedCard(worker);
  }

  /**
   * Limited worker list for a site, accessible to WATCHMAN/SUPERVISOR so the
   * device can warm its offline cache. Includes nfcUid/qrIdentifier (not PII)
   * for local tap resolution; excludes Aadhaar/PF/ESI.
   */
  async listBySite(user: AuthUser, siteId: string) {
    if (!siteId) throw Errors.validation({ message: 'siteId is required' });
    const rows = await this.prisma.worker.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        assignments: { some: { siteId, endDate: null } },
      },
      select: {
        id: true,
        workerCode: true,
        fullName: true,
        photoUrl: true,
        bloodGroup: true,
        emergencyContactName: true,
        emergencyContactNumber: true,
        nfcUid: true,
        qrIdentifier: true,
        category: true,
        vendor: { select: { name: true } },
        designation: { select: { name: true } },
      },
      take: 1000,
    });
    return {
      data: rows.map(({ vendor, designation, ...rest }) => ({
        ...rest,
        vendorName: vendor?.name ?? null,
        designationName: designation?.name ?? null,
      })),
    };
  }

  /**
   * Workers/staff created or last updated by the calling user today (org-local
   * day) — powers the safety officer's "bulk print today's badges".
   */
  async myRecent(user: AuthUser) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { timezone: true },
    });
    const startOfDay = DateTime.now()
      .setZone(org?.timezone ?? 'Asia/Kolkata')
      .startOf('day')
      .toJSDate();

    const rows = await this.prisma.worker.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        updatedAt: { gte: startOfDay },
        OR: [{ createdById: user.userId }, { updatedById: user.userId }],
      },
      select: {
        id: true,
        workerCode: true,
        fullName: true,
        photoUrl: true,
        bloodGroup: true,
        emergencyContactName: true,
        emergencyContactNumber: true,
        category: true,
        createdAt: true,
        vendor: { select: { name: true } },
        designation: { select: { name: true } },
        assignments: {
          where: { endDate: null },
          select: { site: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      data: rows.map(({ vendor, designation, assignments, ...rest }) => ({
        ...rest,
        vendorName: vendor?.name ?? null,
        designationName: designation?.name ?? null,
        siteName: assignments[0]?.site.name ?? null,
      })),
    };
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
      include: { vendor: { select: { name: true } }, designation: { select: { name: true } } },
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
