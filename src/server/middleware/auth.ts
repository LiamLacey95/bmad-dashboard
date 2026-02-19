import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    auth: {
      userId: string;
      role: 'viewer';
      authenticated: boolean;
    };
  }
}

export function authMiddlewarePlaceholder(req: Request, _res: Response, next: NextFunction): void {
  const token = req.header('authorization');
  req.auth = {
    userId: token ? 'placeholder-user' : 'anonymous',
    role: 'viewer',
    authenticated: Boolean(token)
  };
  next();
}
