import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function RequestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = (req.headers['x-request-id'] as string) || randomUUID();
  (req as Request & { requestId: string }).requestId = incoming;
  res.setHeader('x-request-id', incoming);
  next();
}
