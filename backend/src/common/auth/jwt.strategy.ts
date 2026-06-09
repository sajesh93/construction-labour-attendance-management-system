import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from './auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'change_me_access_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return {
      userId: payload.sub,
      organizationId: payload.org,
      role: payload.role,
      email: payload.email,
      siteScopes: payload.scopes ?? [],
    };
  }
}
