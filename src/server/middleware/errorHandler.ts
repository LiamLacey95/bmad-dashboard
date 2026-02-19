import type { NextFunction, Request, Response } from 'express';
import type { AppError, ApiErrorCode, ErrorEnvelope } from '../types.js';
import { logger } from '../observability/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const notFoundError = new Error(`Route not found: ${req.method} ${req.originalUrl}`) as AppError;
  notFoundError.statusCode = 404;
  notFoundError.code = 'NOT_FOUND';
  next(notFoundError);
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode ?? 500;
  const code: ApiErrorCode = err.code ?? 'INTERNAL_ERROR';

  const payload: ErrorEnvelope = {
    error: {
      code,
      message: err.message || 'Internal server error',
      requestId: req.requestId,
      details: err.details
    }
  };

  logger.error('request_failed', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    details: err.details
  });

  res.status(statusCode).json(payload);
}
