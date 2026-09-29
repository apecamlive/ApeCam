/**
 * Sign In With Solana message (phantom/sign-in-with-solana, same text layout as EIP-4361).
 * The browser builds it for `signMessage`, wallets with the `signIn` feature build the same text
 * themselves, and the server parses whatever was signed. EVM uses `viem/siwe` for the SIWE side.
 */
export interface SiwsFields {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: '1';
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

export const SIGN_IN_STATEMENT =
  'Sign in to APECAM. This is a free message signature, not a transaction. APECAM will never ask for your seed phrase or private key.';

export function buildSiwsMessage(f: SiwsFields): string {
  const lines = [`${f.domain} wants you to sign in with your Solana account:`, f.address];
  if (f.statement) lines.push('', f.statement);
  lines.push(
    '',
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  );
  if (f.expirationTime) lines.push(`Expiration Time: ${f.expirationTime}`);
  return lines.join('\n');
}

const FIELD_KEYS: Record<string, keyof SiwsFields> = {
  URI: 'uri',
  Version: 'version',
  'Chain ID': 'chainId',
  Nonce: 'nonce',
  'Issued At': 'issuedAt',
  'Expiration Time': 'expirationTime',
};

/** Tolerant parser: accepts messages built by us or by a wallet's `signIn` implementation. */
export function parseSiwsMessage(message: string): Partial<SiwsFields> | null {
  const lines = message.split('\n');
  const header = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? '');
  if (!header || !lines[1]) return null;
  const fields: Partial<SiwsFields> = { domain: header[1], address: lines[1].trim() };
  const statement: string[] = [];
  let inFields = false;
  for (const line of lines.slice(2)) {
    const idx = line.indexOf(': ');
    const key = idx === -1 ? undefined : FIELD_KEYS[line.slice(0, idx)];
    if (key) {
      inFields = true;
      (fields as Record<string, string>)[key] = line.slice(idx + 2).trim();
    } else if (!inFields) {
      statement.push(line);
    }
  }
  const text = statement.join('\n').trim();
  if (text) fields.statement = text;
  return fields;
}
