import { AuthUser } from './auth-user.interface';
import { Errors } from '../errors/app.exception';

/**
 * SUPER_ADMIN sees all sites in its org. Other roles with NO explicit site
 * scopes also see all org sites (the common case — scopes are an opt-in
 * restriction); once scopes are assigned, access is limited to them.
 */
export function assertSiteInScope(user: AuthUser, siteId: string): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (user.siteScopes.length === 0) return;
  if (!user.siteScopes.includes(siteId)) {
    throw Errors.forbidden('Site not in your scope');
  }
}

/** Prisma `where` fragment restricting to the caller's accessible sites. */
export function siteScopeFilter(user: AuthUser): { id?: { in: string[] } } {
  if (user.role === 'SUPER_ADMIN') return {};
  if (user.siteScopes.length === 0) return {};
  return { id: { in: user.siteScopes } };
}
