import type { DatabaseSync } from 'node:sqlite';
import { runSqlBatchFile } from './database.js';

export function applySqliteMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at_utc TEXT NOT NULL
    );
  `);

  const version = '2026_02_19_story_006';
  const exists = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ? LIMIT 1')
    .get(version) as { version: string } | undefined;

  if (exists) {
    return;
  }

  runSqlBatchFile(db, 'schema.sql');
  runSqlBatchFile(db, 'indexes.sql');

  db.prepare('INSERT INTO schema_migrations(version, applied_at_utc) VALUES(?, ?)').run(version, new Date().toISOString());
}
