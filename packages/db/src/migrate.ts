import { migrateDb } from './client';

// Railway pre-deploy command for the web service: `pnpm --filter @apecam/db migrate`.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
await migrateDb(url);
console.log(JSON.stringify({ msg: 'migrations applied' }));
