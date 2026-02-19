import type { ZodIssue } from 'zod';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED';

export interface AppError extends Error {
  statusCode?: number;
  code?: ApiErrorCode;
  details?: ZodIssue[] | Record<string, unknown>;
}

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface RequestMetrics {
  route: string;
  method: string;
  status: number;
  durationMs: number;
}
