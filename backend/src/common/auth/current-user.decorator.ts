import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth-user.interface';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return data ? req.user?.[data] : req.user;
  },
);
