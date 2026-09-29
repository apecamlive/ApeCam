import { describe, expect, it } from 'vitest';
import { buildSiwsMessage, parseSiwsMessage, SIGN_IN_STATEMENT, type SiwsFields } from './signin';

const fields: SiwsFields = {
  domain: 'apecam.xyz',
  address: '9uNmRWtgQ8oZ4yA7zRk8b7T5mR9dQh1wM3uF2cV6nK4p',
  statement: SIGN_IN_STATEMENT,
  uri: 'https://apecam.xyz',
  version: '1',
  chainId: 'mainnet',
  nonce: 'a1b2c3d4e5f60718',
  issuedAt: '2026-10-01T12:00:00.000Z',
  expirationTime: '2026-10-01T12:05:00.000Z',
};

describe('T-P0-U2 · SIWS message', () => {
  it('builds the standard layout with all required fields', () => {
    const msg = buildSiwsMessage(fields);
    expect(msg.split('\n')[0]).toBe('apecam.xyz wants you to sign in with your Solana account:');
    for (const line of [
      'URI: https://apecam.xyz',
      'Version: 1',
      'Chain ID: mainnet',
      'Nonce: a1b2c3d4e5f60718',
    ]) {
      expect(msg).toContain(line);
    }
    expect(msg).toContain('not a transaction');
  });

  it('round-trips through the parser', () => {
    expect(parseSiwsMessage(buildSiwsMessage(fields))).toEqual(fields);
  });

  it('parses a wallet-built message without statement or expiration', () => {
    const { statement: _s, expirationTime: _e, ...minimal } = fields;
    const parsed = parseSiwsMessage(buildSiwsMessage(minimal as SiwsFields));
    expect(parsed).toMatchObject({ domain: 'apecam.xyz', nonce: fields.nonce });
    expect(parsed?.expirationTime).toBeUndefined();
  });

  it('rejects text that is not a SIWS message', () => {
    expect(parseSiwsMessage('hello world')).toBeNull();
    expect(parseSiwsMessage('apecam.xyz wants you to sign in with your Ethereum account:\n0xabc')).toBeNull();
  });
});
