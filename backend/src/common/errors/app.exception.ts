import { HttpException } from '@nestjs/common';

export interface AppErrorOptions {
  status: number;
  code: string;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
  type?: string;
}

/**
 * Domain exception that renders to RFC 9457 problem+json via AllExceptionsFilter.
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly meta?: Record<string, unknown>;
  readonly type: string;

  constructor(opts: AppErrorOptions) {
    super(opts.title, opts.status);
    this.code = opts.code;
    this.title = opts.title;
    this.detail = opts.detail;
    this.meta = opts.meta;
    this.type = opts.type ?? `https://clams/errors/${opts.code.toLowerCase()}`;
  }
}

// Convenience factories for the documented error codes.
export const Errors = {
  validation: (meta: Record<string, unknown>) =>
    new AppException({ status: 400, code: 'VALIDATION_ERROR', title: 'Validation failed', meta }),
  unauthenticated: (detail?: string) =>
    new AppException({
      status: 401,
      code: 'UNAUTHENTICATED',
      title: 'Authentication required',
      detail,
    }),
  refreshReuse: () =>
    new AppException({ status: 401, code: 'REFRESH_REUSE', title: 'Refresh token reuse detected' }),
  forbidden: (detail?: string) =>
    new AppException({ status: 403, code: 'FORBIDDEN', title: 'Access denied', detail }),
  deviceNotAuthorized: () =>
    new AppException({
      status: 403,
      code: 'DEVICE_NOT_AUTHORIZED',
      title: 'Device not authorized',
    }),
  notFound: (entity = 'Resource') =>
    new AppException({ status: 404, code: 'NOT_FOUND', title: `${entity} not found` }),
  workerNotFound: (detail?: string) =>
    new AppException({ status: 404, code: 'WORKER_NOT_FOUND', title: 'Worker not found', detail }),
  duplicateTap: (cooldownRemainingSeconds: number) =>
    new AppException({
      status: 409,
      code: 'DUPLICATE_TAP',
      title: 'Duplicate tap ignored',
      detail: 'Tap occurred within the cooldown window.',
      meta: { cooldownRemainingSeconds },
    }),
  alreadyOpen: (sessionId: string) =>
    new AppException({
      status: 409,
      code: 'ALREADY_OPEN',
      title: 'Worker already has an open session',
      meta: { sessionId },
    }),
  conflict: (detail?: string) =>
    new AppException({ status: 409, code: 'CONFLICT', title: 'Conflict', detail }),
  geoOutOfRange: (distanceM: number, radiusM: number) =>
    new AppException({
      status: 422,
      code: 'GEO_OUT_OF_RANGE',
      title: 'Outside permitted geofence',
      meta: { distanceM, radiusM },
    }),
  businessRule: (detail: string) =>
    new AppException({
      status: 422,
      code: 'BUSINESS_RULE',
      title: 'Business rule violation',
      detail,
    }),
  rateLimited: () =>
    new AppException({ status: 429, code: 'RATE_LIMITED', title: 'Too many requests' }),
};
