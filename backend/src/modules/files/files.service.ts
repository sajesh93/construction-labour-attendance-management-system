import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { UploadFileDto } from './dto/file.dto';

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB decoded

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(user: AuthUser, dto: UploadFileDto) {
    let data: Buffer;
    try {
      data = Buffer.from(dto.dataBase64, 'base64');
    } catch {
      throw Errors.validation({ message: 'dataBase64 is not valid base64' });
    }
    if (data.length === 0) throw Errors.validation({ message: 'Empty file' });
    if (data.length > MAX_BYTES) {
      throw Errors.validation({ message: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` });
    }

    const blob = await this.prisma.photoBlob.create({
      data: {
        organizationId: user.organizationId,
        mimeType: dto.mimeType,
        data,
        sizeBytes: data.length,
        createdBy: user.userId,
      },
      select: { id: true, mimeType: true, sizeBytes: true },
    });
    return { ...blob, url: `/files/${blob.id}` };
  }

  async get(user: AuthUser, id: string) {
    const blob = await this.prisma.photoBlob.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!blob) throw Errors.notFound('File');
    return blob;
  }
}
