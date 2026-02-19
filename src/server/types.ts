import type { ZodIssue } from 'zod';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED'
  | 'DB_LOCK_TIMEOUT'
  | 'BAD_MESSAGE'
  | 'UNSUPPORTED_MESSAGE_TYPE';

export interface AppError extends Error {
  statusCode?: number;
  code?: ApiErrorCode;
  details?: ZodIssue[] | Record<string, unknown>;
  recoverable?: boolean;
  context?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    recoverable: boolean;
    requestId: string;
    timestampUtc: string;
    details?: unknown;
    context?: Record<string, unknown>;
  };
}

export interface RequestMetrics {
  route: string;
  method: string;
  status: number;
  durationMs: number;
}
