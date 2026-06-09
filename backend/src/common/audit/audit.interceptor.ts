import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Lightweight request-context interceptor. Attaches request metadata (ip,
 * requestId, deviceId) onto the request so domain services can pull it when
 * writing precise audit entries via AuditService.record(). Domain-level audit
 * is explicit by design — see AuditService.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    req.auditContext = {
      ipAddress: req.ip ?? req.headers?.['x-forwarded-for'] ?? null,
      requestId: req.requestId ?? null,
      deviceId: req.headers?.['x-device-id'] ?? null,
    };
    return next.handle();
  }
}
