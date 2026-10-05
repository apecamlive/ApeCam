import { describe, expect, it, vi } from 'vitest';
import { SolanaAdapter } from './solana';
import { ChainRpcError, TokenNotFoundError } from './types';

const OWNER = '9uNmRWtgQ8oZ4yA7zRk8b7T5mR9dQh1wM3uF2cV6nK4p';
const MINT = '3wSTPDipQ7Wm1E8o2kFJ6yR3mA5bN9cX4vT2uS8pump';

function tokenAccount(amount: string, decimals = 6) {
  return { account: { data: { parsed: { info: { mint: MINT, tokenAmount: { amount, decimals } } } } } };
}

function rpcResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
}

describe('SolanaAdapter', () => {
  it('T-P0-U6 · sums balance across several token accounts (Token-2022 included)', async () => {
    const fetchMock = vi.fn(async () => rpcResponse({ value: [tokenAccount('900'), tokenAccount('100')] }));
    const adapter = new SolanaAdapter({ rpcUrls: ['https://rpc-a'], fetch: fetchMock as typeof fetch });

    const bal = await adapter.getBalance(OWNER, MINT);

    expect(bal).toEqual({ contract: MINT, rawBalance: 1000n, decimals: 6 });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.method).toBe('getTokenAccountsByOwner');
    expect(body.params[1]).toEqual({ mint: MINT });
  });

  it('T-P0-U6 · no token account → zero balance with decimals from the mint', async () => {
    const mint = {
      owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      data: { parsed: { type: 'mint', info: { decimals: 9 } } },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rpcResponse({ value: [] }))
      .mockResolvedValueOnce(rpcResponse({ value: mint }));
    const adapter = new SolanaAdapter({ rpcUrls: ['https://rpc-a'], fetch: fetchMock });

    expect(await adapter.getBalance(OWNER, MINT)).toEqual({ contract: MINT, rawBalance: 0n, decimals: 9 });
  });

  it('reads Token-2022 metadata extension (name, symbol, uri)', async () => {
    const mint = {
      owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      data: {
        parsed: {
          type: 'mint',
          info: {
            decimals: 6,
            extensions: [
              {
                extension: 'tokenMetadata',
                state: { name: 'Ape Coin', symbol: 'APE', uri: 'https://x/meta.json' },
              },
            ],
          },
        },
      },
    };
    const adapter = new SolanaAdapter({
      rpcUrls: ['https://rpc-a'],
      fetch: vi.fn(async () => rpcResponse({ value: mint })),
    });
    expect(await adapter.getTokenMeta(MINT)).toEqual({
      contract: MINT,
      decimals: 6,
      name: 'Ape Coin',
      ticker: 'APE',
      metadataUri: 'https://x/meta.json',
    });
  });

  it('non-mint account → TokenNotFoundError', async () => {
    const adapter = new SolanaAdapter({
      rpcUrls: ['https://rpc-a'],
      fetch: vi.fn(async () => rpcResponse({ value: null })),
    });
    await expect(adapter.getTokenMeta(MINT)).rejects.toBeInstanceOf(TokenNotFoundError);
  });

  it('T-P0-U7 · primary RPC fails → fallback RPC is used', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://rpc-a') throw new Error('ETIMEDOUT');
      return rpcResponse({ value: [tokenAccount('5')] });
    });
    const adapter = new SolanaAdapter({
      rpcUrls: ['https://rpc-a', 'https://rpc-b'],
      fetch: fetchMock as never,
    });

    expect((await adapter.getBalance(OWNER, MINT)).rawBalance).toBe(5n);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://rpc-a', 'https://rpc-b']);
  });

  it('T-P0-U7 · all RPCs fail → ChainRpcError (RPC_UNAVAILABLE), not a zero balance', async () => {
    const adapter = new SolanaAdapter({
      rpcUrls: ['https://rpc-a', 'https://rpc-b'],
      fetch: vi.fn(async () => new Response('busy', { status: 429 })),
    });
    await expect(adapter.getBalance(OWNER, MINT)).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    await expect(adapter.getBalance(OWNER, MINT)).rejects.toBeInstanceOf(ChainRpcError);
  });

  it('validates base58 32-byte addresses', () => {
    const adapter = new SolanaAdapter({ rpcUrls: ['https://rpc-a'] });
    expect(adapter.isValidAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe(true);
    expect(adapter.isValidAddress('0x1234')).toBe(false);
    expect(adapter.isValidAddress('abc')).toBe(false);
  });
});

describe('SolanaAdapter.listHoldings', () => {
  it('merges both token programs, sums per mint, drops zero balances', async () => {
    const acct = (mint: string, amount: string, decimals = 6) => ({
      account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } },
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const legacy = body.params[1].programId.startsWith('Tokenkeg');
      return rpcResponse({
        value: legacy ? [acct('A', '5'), acct('Z', '0')] : [acct('A', '7'), acct('B', '1', 9)],
      });
    });
    const adapter = new SolanaAdapter({ rpcUrls: ['https://rpc-a'], fetch: fetchMock as never });
    const res = await adapter.listHoldings(OWNER);
    expect(res).toEqual([
      { contract: 'A', rawBalance: 12n, decimals: 6 },
      { contract: 'B', rawBalance: 1n, decimals: 9 },
    ]);
  });
});
