import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PhotoKind } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { Errors } from '../../common/errors/app.exception';
import { UploadFileDto } from './dto/file.dto';

// Accept fairly large raw captures; we re-compress before storing.
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB decoded
// Lossy re-encode targets (chosen so Aadhaar text stays readable).
const MAX_EDGE = 1600; // longest side, px
const JPEG_QUALITY = 80;
// Aadhaar cards are the only images we ever machine-read: their Secure QR is a
// 145–177 module symbol, and JPEG ringing around those modules is what defeats
// a decoder. A clean symbol still survives 1600px/q80, so the extra headroom
// here is margin for a real photograph's print texture and glare — not a fix
// for an image that was already too small. Kept deliberately modest: these
// images are stored in the database and counted against the storage budget.
const AADHAAR_MAX_EDGE = 2000;
const AADHAAR_JPEG_QUALITY = 88;

const AADHAAR_KINDS: PhotoKind[] = ['AADHAAR_FRONT', 'AADHAAR_BACK'];

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async upload(user: AuthUser, dto: UploadFileDto) {
    let raw: Buffer;
    try {
      raw = Buffer.from(dto.dataBase64, 'base64');
    } catch {
      throw Errors.validation({ message: 'dataBase64 is not valid base64' });
    }
    if (raw.length === 0) throw Errors.validation({ message: 'Empty file' });
    if (raw.length > MAX_INPUT_BYTES) {
      throw Errors.validation({
        message: `File too large (max ${MAX_INPUT_BYTES / 1024 / 1024} MB)`,
      });
    }

    const kind: PhotoKind = dto.kind ?? 'PROFILE';
    const originalSizeBytes = raw.length;

    // 1) Lossy re-encode: downscale + JPEG. Real storage savings vs. the raw
    //    camera bytes; the result is visually identical and fully readable.
    const {
      buffer: compressed,
      mimeType,
      compressed: didCompress,
    } = await this.compress(raw, dto.mimeType, kind);

    // 2) Aadhaar and ID-proof images are encrypted at rest; profile photos are
    //    not (they are streamed to many viewers / cached on devices, so we
    //    keep them cheap).
    const encrypt = kind === 'AADHAAR_FRONT' || kind === 'AADHAAR_BACK' || kind === 'ID_PROOF';
    const stored = encrypt ? this.crypto.encryptBuffer(compressed) : compressed;

    const blob = await this.prisma.photoBlob.create({
      data: {
        organizationId: user.organizationId,
        mimeType,
        data: stored,
        sizeBytes: stored.length,
        originalSizeBytes,
        kind,
        isCompressed: didCompress,
        isEncrypted: encrypt,
        createdBy: user.userId,
      },
      select: { id: true, mimeType: true, sizeBytes: true, originalSizeBytes: true, kind: true },
    });
    return { ...blob, url: `/files/${blob.id}` };
  }

  /**
   * Returns a blob with `data` already decrypted back to its viewable image
   * bytes so the caller can stream it directly.
   */
  async get(user: AuthUser, id: string) {
    const blob = await this.prisma.photoBlob.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!blob) throw Errors.notFound('File');
    const data = blob.isEncrypted
      ? this.crypto.decryptBuffer(Buffer.from(blob.data))
      : Buffer.from(blob.data);
    return { ...blob, data };
  }

  private async compress(
    raw: Buffer,
    originalMime: string,
    kind: PhotoKind = 'PROFILE',
  ): Promise<{ buffer: Buffer; mimeType: string; compressed: boolean }> {
    const isAadhaar = AADHAAR_KINDS.includes(kind);
    const edge = isAadhaar ? AADHAAR_MAX_EDGE : MAX_EDGE;
    const quality = isAadhaar ? AADHAAR_JPEG_QUALITY : JPEG_QUALITY;
    try {
      const buffer = await sharp(raw)
        .rotate() // honour EXIF orientation before stripping metadata
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      return { buffer, mimeType: 'image/jpeg', compressed: true };
    } catch (e) {
      // If sharp can't decode it (corrupt/unsupported), fall back to the raw
      // bytes + original mime rather than failing the upload outright.
      this.logger.warn(`Image compression failed, storing original: ${String(e)}`);
      return { buffer: raw, mimeType: originalMime, compressed: false };
    }
  }
}
