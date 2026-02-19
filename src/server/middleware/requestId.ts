import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-correlation-id') ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-correlation-id', requestId);
  next();
}
