import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as argon2 from 'argon2';

/**
 * Field-level encryption for sensitive data (e.g. Aadhaar) using AES-256-GCM.
 * Stored blob layout: [12-byte IV][16-byte auth tag][ciphertext].
 * Password hashing uses Argon2id.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly IV_LEN = 12;
  private readonly TAG_LEN = 16;

  constructor() {
    const b64 = process.env.DATA_ENCRYPTION_KEY;
    if (!b64) {
      throw new InternalServerErrorException('DATA_ENCRYPTION_KEY is not configured');
    }
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException('DATA_ENCRYPTION_KEY must decode to 32 bytes');
    }
    this.key = key;
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(this.IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, this.IV_LEN);
    const tag = blob.subarray(this.IV_LEN, this.IV_LEN + this.TAG_LEN);
    const data = blob.subarray(this.IV_LEN + this.TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Argon2id hash used for opaque tokens (refresh, device). */
  async hashToken(token: string): Promise<string> {
    return argon2.hash(token, { type: argon2.argon2id });
  }

  async verifyToken(hash: string, token: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, token);
    } catch {
      return false;
    }
  }
}
