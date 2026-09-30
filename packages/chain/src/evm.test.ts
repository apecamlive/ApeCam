import { custom, decodeFunctionData, encodeFunctionResult, erc20Abi } from 'viem';
import { base } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { EvmAdapter } from './evm';
import { ChainRpcError, HoldingsUnsupportedError, TokenNotFoundError } from './types';

const TOKEN = '0x1111111111111111111111111111111111111111';
const WALLET = '0x2222222222222222222222222222222222222222';

/** Fake JSON-RPC node that answers eth_call for a single ERC-20. */
function fakeErc20(opts: {
  balance?: bigint;
  decimals?: number;
  name?: string;
  symbol?: string;
  fail?: 'rpc' | 'empty';
}) {
  return custom({
    async request({ method, params }) {
      if (opts.fail === 'rpc') throw new Error('connection reset');
      if (method === 'eth_chainId') return '0x2105';
      if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
      if (opts.fail === 'empty') return '0x';
      const [{ data }] = params as [{ data: `0x${string}` }];
      const { functionName } = decodeFunctionData({ abi: erc20Abi, data });
      const values: Record<string, unknown> = {
        balanceOf: opts.balance ?? 0n,
        decimals: opts.decimals ?? 18,
        name: opts.name ?? 'Token',
        symbol: opts.symbol ?? 'TKN',
      };
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: functionName as 'decimals',
        result: values[functionName] as never,
      });
    },
  });
}

describe('EvmAdapter', () => {
  it('reads balance and decimals', async () => {
    const adapter = new EvmAdapter({
      chain: 'base',
      viemChain: base,
      transport: fakeErc20({ balance: 1234n, decimals: 6 }),
    });
    expect(await adapter.getBalance(WALLET, TOKEN)).toEqual({
      contract: TOKEN,
      rawBalance: 1234n,
      decimals: 6,
    });
  });

  it('reads token meta', async () => {
    const adapter = new EvmAdapter({
      chain: 'base',
      viemChain: base,
      transport: fakeErc20({ decimals: 18, name: 'Ape', symbol: 'APE' }),
    });
    expect(await adapter.getTokenMeta(TOKEN)).toEqual({
      contract: TOKEN,
      decimals: 18,
      name: 'Ape',
      ticker: 'APE',
    });
  });

  it('address with no contract → TokenNotFoundError', async () => {
    const adapter = new EvmAdapter({
      chain: 'base',
      viemChain: base,
      transport: fakeErc20({ fail: 'empty' }),
    });
    await expect(adapter.getTokenMeta(TOKEN)).rejects.toBeInstanceOf(TokenNotFoundError);
  });

  it('T-P0-U7 · RPC failure → ChainRpcError (RPC_UNAVAILABLE)', async () => {
    const adapter = new EvmAdapter({ chain: 'base', viemChain: base, transport: fakeErc20({ fail: 'rpc' }) });
    await expect(adapter.getBalance(WALLET, TOKEN)).rejects.toBeInstanceOf(ChainRpcError);
  });

  it('validates addresses (checksum not required)', () => {
    const adapter = new EvmAdapter({ chain: 'base', viemChain: base, transport: fakeErc20({}) });
    expect(adapter.isValidAddress(TOKEN)).toBe(true);
    expect(adapter.isValidAddress('0x123')).toBe(false);
  });
});

describe('EvmAdapter.listHoldings', () => {
  it('uses the Alchemy Token API and reads decimals for non-zero balances', async () => {
    const transport = custom({
      async request({ method, params }) {
        if (method === 'alchemy_getTokenBalances') {
          return {
            tokenBalances: [
              { contractAddress: '0xAAAA000000000000000000000000000000000001', tokenBalance: '0x0a' },
              { contractAddress: '0xAAAA000000000000000000000000000000000002', tokenBalance: '0x0' },
            ],
          };
        }
        if (method === 'eth_chainId') return '0x2105';
        const [{ data }] = params as [{ data: `0x${string}` }];
        decodeFunctionData({ abi: erc20Abi, data });
        return encodeFunctionResult({ abi: erc20Abi, functionName: 'decimals', result: 18 });
      },
    });
    const adapter = new EvmAdapter({ chain: 'base', viemChain: base, transport });
    expect(await adapter.listHoldings(WALLET)).toEqual([
      { contract: '0xaaaa000000000000000000000000000000000001', rawBalance: 10n, decimals: 18 },
    ]);
  });

  it('plain RPC without the Token API → HoldingsUnsupportedError', async () => {
    const transport = custom({
      async request() {
        throw Object.assign(new Error('the method alchemy_getTokenBalances does not exist'), {
          code: -32601,
        });
      },
    });
    const adapter = new EvmAdapter({ chain: 'robinhood', viemChain: base, transport });
    await expect(adapter.listHoldings(WALLET)).rejects.toBeInstanceOf(HoldingsUnsupportedError);
  });
});
