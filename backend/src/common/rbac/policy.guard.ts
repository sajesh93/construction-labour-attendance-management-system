import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY, PUBLIC_KEY } from './rbac.decorators';
import { Permission, roleHasPermission } from './permissions';
import { Errors } from '../errors/app.exception';
import { AuthUser } from '../auth/auth-user.interface';

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw Errors.unauthenticated();

    const ok = required.every((p) => roleHasPermission(user.role, p));
    if (!ok) {
      throw Errors.forbidden(`Missing permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
