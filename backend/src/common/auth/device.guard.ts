import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DEVICE_AUTH_KEY } from '../rbac/rbac.decorators';
import { DeviceAuthService } from '../../modules/devices/device-auth.service';
import { Errors } from '../errors/app.exception';

/**
 * Guards routes marked @RequiresDevice(): requires headers
 *   X-Device-Id and X-Device-Token
 * referring to an AUTHORIZED device with a matching token hash.
 */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly deviceAuth: DeviceAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requires = this.reflector.getAllAndOverride<boolean>(DEVICE_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requires) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const deviceId = req.headers['x-device-id'] as string;
    const token = req.headers['x-device-token'] as string;
    if (!deviceId || !token) throw Errors.deviceNotAuthorized();

    const ok = await this.deviceAuth.validateToken(deviceId, token);
    if (!ok) throw Errors.deviceNotAuthorized();

    (req as Request & { deviceId: string }).deviceId = deviceId;
    return true;
  }
}
