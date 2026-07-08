import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';

export const PERMISSIONS_KEY = 'required_permissions';
export const PUBLIC_KEY = 'is_public';
export const DEVICE_AUTH_KEY = 'requires_device';

/** Require one or more permissions (all must be held). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Mark a route as public (skips JWT auth). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Mark a route as requiring an authorized device (attendance/sync). */
export const RequiresDevice = () => SetMetadata(DEVICE_AUTH_KEY, true);

export const DEVICE_EXEMPT_KEY = 'device_exempt';

/**
 * Skip the role-based device-approval check (auth endpoints must stay
 * reachable so a user on a pending device can register it / see its status).
 */
export const DeviceExempt = () => SetMetadata(DEVICE_EXEMPT_KEY, true);
