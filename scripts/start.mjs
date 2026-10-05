// Root start command for Railway (Railpack runs `pnpm start` from the repository root).
// Picks the app from APECAM_SERVICE (web | worker) or Railway's RAILWAY_SERVICE_NAME, so both services can share
// one repository root without per-service dashboard settings. The web service applies database migrations
// first (serialised by an advisory lock, so several replicas can start at once).
import { spawn } from 'node:child_process';

const explicit = process.env.APECAM_SERVICE?.trim().toLowerCase();
const railwayName = (process.env.RAILWAY_SERVICE_NAME ?? '').toLowerCase();
const app =
  explicit || (railwayName.includes('worker') ? 'worker' : railwayName.includes('web') ? 'web' : '');

if (app !== 'web' && app !== 'worker') {
  console.error(
    `Cannot tell which app to start (APECAM_SERVICE=${explicit ?? ''}, RAILWAY_SERVICE_NAME=${railwayName}). ` +
      'Set APECAM_SERVICE to "web" or "worker" on this service.',
  );
  process.exit(1);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
    // Forward Railway's stop signal so the app can drain (worker closes BullMQ, web finishes requests).
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
    child.on('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code ?? signal}`)),
    );
  });
}

try {
  if (app === 'web') await run(['--filter', '@apecam/db', 'migrate']);
  await run(['--filter', `@apecam/${app}`, 'start']);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
