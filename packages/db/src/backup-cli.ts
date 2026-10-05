/**
 * Manual backup / restore (runbook: docs/runbooks/restore-database.md).
 *
 *   pnpm --filter @apecam/db backup  [out.json.gz]
 *   pnpm --filter @apecam/db restore <in.json.gz> [--replace]
 *
 * Both use DATABASE_URL. Restore expects a database already migrated to the backup's version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBackup, encodeBackup, exportBackup, restoreBackup } from './backup';
import { createDb } from './client';

const [cmd, file, flag] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, pool } = createDb(url, 2);

try {
  if (cmd === 'backup') {
    const out = file ?? `apecam-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
    const backup = await exportBackup(db);
    writeFileSync(out, encodeBackup(backup));
    const rows = Object.values(backup.tables).reduce((n, t) => n + t.length, 0);
    console.log(`wrote ${out}: ${rows} rows, migration ${backup.migration ?? 'unknown'}`);
  } else if (cmd === 'restore' && file) {
    const counts = await restoreBackup(db, decodeBackup(readFileSync(file)), {
      replace: flag === '--replace',
    });
    console.log('restored', counts);
  } else {
    console.error('usage: backup [out.json.gz] | restore <in.json.gz> [--replace]');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
