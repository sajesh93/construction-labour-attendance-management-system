import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { Errors } from '../../common/errors/app.exception';
import { JwtPayload } from '../../common/auth/auth-user.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
  private refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 2592000);

  async login(email: string, password: string, ip?: string): Promise<TokenPair & { user: unknown }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { siteScopes: true },
    });
    if (!user || !user.isActive) throw Errors.unauthenticated('Invalid credentials');

    const valid = await this.crypto.verifyPassword(user.passwordHash, password);
    if (!valid) throw Errors.unauthenticated('Invalid credentials');

    const scopes = user.siteScopes.map((s) => s.siteId);
    const tokens = await this.issueTokens(user.id, user.organizationId, user.role, user.email, scopes);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }

  private async issueTokens(
    userId: string,
    org: string,
    role: JwtPayload['role'],
    email: string | null,
    scopes: string[],
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, org, role, email, scopes };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET ?? 'change_me_access_secret',
      expiresIn: this.accessTtl,
    });

    // Opaque refresh token = jti.secret; only the hash is stored.
    const jti = randomUUID();
    const secret = randomUUID();
    const refreshToken = `${jti}.${secret}`;
    const tokenHash = await this.crypto.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const [jti] = refreshToken.split('.');
    if (!jti) throw Errors.unauthenticated('Malformed refresh token');

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: jti } });
    if (!stored) throw Errors.unauthenticated('Unknown refresh token');

    // Reuse detection: a revoked/replaced token being presented again →
    // revoke the entire family and force re-login.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw Errors.refreshReuse();
    }
    if (stored.expiresAt < new Date()) throw Errors.unauthenticated('Refresh token expired');

    const matches = await this.crypto.verifyToken(stored.tokenHash, refreshToken);
    if (!matches) throw Errors.unauthenticated('Invalid refresh token');

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { siteScopes: true },
    });
    if (!user || !user.isActive) throw Errors.unauthenticated('User inactive');

    const scopes = user.siteScopes.map((s) => s.siteId);
    const next = await this.issueTokens(
      user.id,
      user.organizationId,
      user.role,
      user.email,
      scopes,
      stored.familyId,
    );

    const nextJti = next.refreshToken.split('.')[0];
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: nextJti },
    });

    return next;
  }

  async logout(refreshToken: string): Promise<void> {
    const [jti] = refreshToken.split('.');
    if (!jti) return;
    await this.prisma.refreshToken.updateMany({
      where: { id: jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { siteScopes: true },
    });
    if (!user) throw Errors.notFound('User');
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      siteScopes: user.siteScopes.map((s) => s.siteId),
    };
  }
}
