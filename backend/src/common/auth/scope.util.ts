import { AuthUser } from './auth-user.interface';
import { Errors } from '../errors/app.exception';

/** SUPER_ADMIN sees all sites in its org; others are limited to siteScopes. */
export function assertSiteInScope(user: AuthUser, siteId: string): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.siteScopes.includes(siteId)) {
    throw Errors.forbidden('Site not in your scope');
  }
}

/** Prisma `where` fragment restricting to the caller's accessible sites. */
export function siteScopeFilter(user: AuthUser): { id?: { in: string[] } } {
  if (user.role === 'SUPER_ADMIN') return {};
  return { id: { in: user.siteScopes } };
}
