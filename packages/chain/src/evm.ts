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
