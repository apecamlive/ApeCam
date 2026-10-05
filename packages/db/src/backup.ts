import { gunzipSync, gzipSync } from 'node:zlib';
import { sql } from 'drizzle-orm';
import type { Db } from './client';

/**
 * Logical backup of the tables that cannot be rebuilt from the chain or re-derived (S4-10). A second line of
 * defence next to Railway's volume backups: portable, restorable into any Postgres (or PGlite) at the same
 * migration.
 *
 * Rows travel as JSON (`row_to_json`) and come back with `json_populate_recordset`, so Postgres itself does
 * every type conversion (uuid, numeric, bigint, timestamptz, jsonb) and nothing is lost in JavaScript.
 */

/** Foreign-key order: parents before children. holding_checks and chat_messages are left out (high volume, ephemeral). */
export const BACKUP_TABLES = [
  'users',
  'wallets',
  'tokens',
  'streams',
  'stream_minutes',
  'payout_batches',
  'rewards',
  'treasury_transfers',
  'reports',
  'mod_actions',
  'buybacks',
  'burns',
  'sync_cursors',
  'app_config',
  'go_live_invites',
] as const;

export interface Backup {
  format: 'apecam-backup/1';
  createdAt: string;
  /** Hash of the newest applied migration; restore refuses a mismatch. */
  migration: string | null;
  tables: Record<string, unknown[]>;
}

type ExecResult = { rows?: unknown[] } | unknown[];
const rowsOf = <T>(res: ExecResult) => (Array.isArray(res) ? res : (res.rows ?? [])) as T[];

async function latestMigration(db: Db) {
  try {
    const res = await db.execute(
      sql`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    );
    return rowsOf<{ hash: string }>(res as ExecResult)[0]?.hash ?? null;
  } catch {
    return null;
  }
}

export async function exportBackup(db: Db, now = new Date()): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  // One snapshot for all tables, so rows referencing each other stay consistent.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read, read only`);
    for (const t of BACKUP_TABLES) {
      const res = await tx.execute(sql`select row_to_json(t) as r from ${sql.identifier(t)} t`);
      tables[t] = rowsOf<{ r: unknown }>(res as ExecResult).map((x) =>
        typeof x.r === 'string' ? JSON.parse(x.r) : x.r,
      );
    }
  });
  return {
    format: 'apecam-backup/1',
    createdAt: now.toISOString(),
    migration: await latestMigration(db),
    tables,
  };
}

/**
 * Restores into a migrated database. Refuses a non-empty `users` table unless `replace` is set, in which case
 * the backed-up tables are truncated first. All or nothing: one transaction.
 */
export async function restoreBackup(db: Db, backup: Backup, opts: { replace?: boolean } = {}) {
  if (backup.format !== 'apecam-backup/1') throw new Error(`unknown backup format ${String(backup.format)}`);
  const migration = await latestMigration(db);
  if (backup.migration && migration && backup.migration !== migration) {
    throw new Error(
      'backup was taken at a different migration; migrate the target to the same version first',
    );
  }
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    const existing = rowsOf<{ n: number }>(
      (await tx.execute(sql`select count(*)::int as n from users`)) as ExecResult,
    )[0]!.n;
    if (existing > 0) {
      if (!opts.replace) throw new Error('target database is not empty (pass replace to overwrite)');
      await tx.execute(
        sql.raw(`truncate ${[...BACKUP_TABLES, 'holding_checks', 'chat_messages'].join(', ')} cascade`),
      );
    }
    for (const t of BACKUP_TABLES) {
      const rows = backup.tables[t] ?? [];
      counts[t] = rows.length;
      // Chunked so one statement's JSON parameter stays small.
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = JSON.stringify(rows.slice(i, i + 1000));
        await tx.execute(
          sql`insert into ${sql.identifier(t)} select * from json_populate_recordset(null::${sql.identifier(t)}, ${chunk}::json)`,
        );
      }
    }
  });
  return counts;
}

export const encodeBackup = (b: Backup) => new Uint8Array(gzipSync(JSON.stringify(b)));
export const decodeBackup = (bytes: Uint8Array) => JSON.parse(gunzipSync(bytes).toString('utf8')) as Backup;
