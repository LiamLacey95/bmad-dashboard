import type { NextFunction, Request, Response } from 'express';
import { logger } from '../observability/logger.js';
import { metricsRegistry } from '../observability/metrics.js';

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - start;
    const durationMs = Number(elapsedNs) / 1_000_000;

    metricsRegistry.recordApiRequestDuration({
      route: req.route?.path ?? req.path,
      method: req.method,
      status: res.statusCode,
      durationMs
    });

    logger.info('api_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      api_request_duration_ms: Number(durationMs.toFixed(2))
    });
  });

  next();
}
