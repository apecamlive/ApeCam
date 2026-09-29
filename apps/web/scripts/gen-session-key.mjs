// Prints an ES256 private key for SESSION_JWT_PRIVATE_KEY (Railway variable or .env.local).
// The PEM is printed on one line with literal "\n" separators; session.ts turns them back into newlines.
import { exportPKCS8, generateKeyPair } from 'jose';

const { privateKey } = await generateKeyPair('ES256', { extractable: true });
const pem = await exportPKCS8(privateKey);
console.log(`SESSION_JWT_PRIVATE_KEY="${pem.trim().split('\n').join('\\n')}"`);
console.log(`SESSION_JWT_KID=${new Date().toISOString().slice(0, 10)}`);
