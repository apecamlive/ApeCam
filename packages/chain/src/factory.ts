import { EvmAdapter } from './evm';
import { CHAINS, type ChainId } from './registry';
import { SolanaAdapter } from './solana';
import type { ChainAdapter } from './types';

export interface ChainAdapters {
  get(id: ChainId): ChainAdapter;
}

/** Builds one adapter per chain from environment variables (see registry `rpcEnv`). */
export function createChainAdapters(env: Record<string, string | undefined> = process.env): ChainAdapters {
  const urls = (id: ChainId) => CHAINS[id].rpcEnv.map((k) => env[k]).filter((u): u is string => !!u);
  const solanaUrls = urls('solana');
  const adapters = new Map<ChainId, ChainAdapter>([
    [
      'solana',
      new SolanaAdapter({
        rpcUrls: solanaUrls.length ? solanaUrls : ['https://api.mainnet-beta.solana.com'],
      }),
    ],
  ]);
  for (const id of ['robinhood', 'base', 'bsc'] as const) {
    adapters.set(id, new EvmAdapter({ chain: id, viemChain: CHAINS[id].evm!, rpcUrls: urls(id) }));
  }
  return { get: (id) => adapters.get(id)! };
}
