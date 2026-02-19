import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { AppError } from '../../types.js';
import { metricsRegistry } from '../../observability/metrics.js';

const SQLITE_BUSY_RETRYABLE = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED']);

export interface SqliteContext {
  db: DatabaseSync;
  close: () => void;
}

export function createSqliteContext(filePath: string): SqliteContext {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec('PRAGMA busy_timeout=2500;');

  return {
    db,
    close: () => db.close()
  };
}

export function runSqlBatchFile(db: DatabaseSync, relativeSqlPath: string): void {
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const sqlPath = join(selfDir, relativeSqlPath);
  db.exec(readFileSync(sqlPath, 'utf8'));
}

function toAppError(error: unknown, message: string): AppError {
  const appError = new Error(message) as AppError;
  appError.statusCode = 503;
  appError.code = 'DB_LOCK_TIMEOUT';
  appError.recoverable = true;
  appError.context = {
    cause: error instanceof Error ? error.message : String(error),
    action: 'retry_request'
  };
  return appError;
}

export function withSqliteRetry<T>(fn: () => T, retries = 4): T {
  let attempt = 0;
  let lockWaitMs = 0;

  while (attempt <= retries) {
    try {
      const value = fn();
      if (lockWaitMs > 0) {
        metricsRegistry.observeSqliteWriteLockWait(lockWaitMs);
      }
      return value;
    } catch (error) {
      const maybeCode = (error as { code?: string }).code;
      if (!maybeCode || !SQLITE_BUSY_RETRYABLE.has(maybeCode)) {
        throw error;
      }

      if (attempt === retries) {
        throw toAppError(error, 'Database is temporarily busy; retry shortly.');
      }

      const delayMs = 25 * Math.pow(2, attempt);
      const delayEnd = Date.now() + delayMs;
      while (Date.now() < delayEnd) {
        // Busy spin to keep implementation dependency-free and deterministic in tests.
      }
      lockWaitMs += delayMs;
      attempt += 1;
    }
  }

  throw toAppError(new Error('SQLite retry failed'), 'Database lock retry failed.');
}

export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
