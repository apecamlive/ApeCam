import {
  ContractFunctionExecutionError,
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  isAddress,
  type Chain,
  type PublicClient,
  type Transport,
} from 'viem';
import type { ChainId } from './registry';
import {
  ChainRpcError,
  HoldingsUnsupportedError,
  TokenNotFoundError,
  type ChainAdapter,
  type TokenHolding,
  type TokenMeta,
} from './types';

export interface EvmAdapterOptions {
  chain: ChainId;
  viemChain: Chain;
  /** Primary first. Ignored when `transport` is given (tests). */
  rpcUrls?: string[];
  transport?: Transport;
  timeoutMs?: number;
}

/** One class for every EVM chain; only chain config and RPC URLs differ (Dev Brief: chain adapters). */
export class EvmAdapter implements ChainAdapter {
  readonly family = 'evm' as const;
  readonly chain: ChainId;
  private readonly client: PublicClient;

  constructor(opts: EvmAdapterOptions) {
    this.chain = opts.chain;
    const timeout = opts.timeoutMs ?? 5000;
    const urls = opts.rpcUrls?.length ? opts.rpcUrls : opts.viemChain.rpcUrls.default.http;
    const transport = opts.transport ?? fallback(urls.map((url) => http(url, { timeout, retryCount: 2 })));
    this.client = createPublicClient({ chain: opts.viemChain, transport });
  }

  isValidAddress(address: string) {
    return isAddress(address, { strict: false });
  }

  async getBalance(wallet: string, contract: string): Promise<TokenHolding> {
    const address = contract as `0x${string}`;
    const [rawBalance, decimals] = await this.call(() =>
      Promise.all([
        this.client.readContract({
          address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet as `0x${string}`],
        }),
        this.client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
      ]),
    );
    return { contract: contract.toLowerCase(), rawBalance, decimals };
  }

  async getTokenMeta(contract: string): Promise<TokenMeta> {
    const address = contract as `0x${string}`;
    const decimals = await this.call(() =>
      this.client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    );
    // name/symbol are optional in ERC-20; a token without them is still valid.
    const [name, ticker] = await Promise.all([
      this.client.readContract({ address, abi: erc20Abi, functionName: 'name' }).catch(() => undefined),
      this.client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }).catch(() => undefined),
    ]);
    return { contract: contract.toLowerCase(), decimals, name, ticker };
  }

  /**
   * Plain JSON-RPC cannot list a wallet's ERC-20s; this uses Alchemy's Token API, which covers
   * Robinhood Chain, Base and BNB (ADR 001). Other RPCs → HoldingsUnsupportedError (Studio falls back to paste-CA).
   */
  async listHoldings(wallet: string): Promise<TokenHolding[]> {
    let res: { tokenBalances: { contractAddress: string; tokenBalance: string | null }[] };
    try {
      res = await this.client.request({
        method: 'alchemy_getTokenBalances' as never,
        params: [wallet, 'erc20'] as never,
      });
    } catch (err) {
      const e = err as { code?: number; walk?: (fn: (e: unknown) => boolean) => unknown };
      const notFound = e.code === -32601 || !!e.walk?.((x) => (x as { code?: number }).code === -32601);
      if (notFound) throw new HoldingsUnsupportedError(`${this.chain} RPC cannot list token balances`);
      throw new ChainRpcError(`EVM RPC failed on ${this.chain}`, err);
    }
    const nonZero = res.tokenBalances
      .filter((b) => b.tokenBalance && BigInt(b.tokenBalance) > 0n)
      .slice(0, 100); // spam airdrops can be endless; 100 is plenty for a picker
    const decimals = await Promise.all(
      nonZero.map((b) =>
        this.client
          .readContract({
            address: b.contractAddress.toLowerCase() as `0x${string}`,
            abi: erc20Abi,
            functionName: 'decimals',
          })
          .catch(() => null),
      ),
    );
    return nonZero.flatMap((b, i) =>
      decimals[i] === null
        ? []
        : [
            {
              contract: b.contractAddress.toLowerCase(),
              rawBalance: BigInt(b.tokenBalance!),
              decimals: decimals[i]!,
            },
          ],
    );
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      // A revert or empty return means "not an ERC-20 at this address"; anything else is an RPC problem.
      if (err instanceof ContractFunctionExecutionError && /reverted|returned no data/i.test(err.message)) {
        throw new TokenNotFoundError(err.shortMessage);
      }
      throw new ChainRpcError(`EVM RPC failed on ${this.chain}`, err);
    }
  }
}
