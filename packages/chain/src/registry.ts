import { defineChain, type Chain } from 'viem';
import { base, bsc } from 'viem/chains';

export const CHAIN_IDS = ['solana', 'robinhood', 'base', 'bsc'] as const;
export type ChainId = (typeof CHAIN_IDS)[number];
export type ChainFamily = 'solana' | 'evm';

// ADR 001: chain 4663, ~0.1s blocks, public RPC is rate limited (Alchemy in production).
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});

export interface ChainInfo {
  id: ChainId;
  family: ChainFamily;
  name: string;
  /** DexScreener chain slug (ADR 002). */
  dexscreener: string;
  explorer: string;
  explorerToken: (contract: string) => string;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
  evm?: Chain;
  /** Env var names holding RPC URLs, primary first. */
  rpcEnv: string[];
}

const evmExplorer = (url: string) => ({
  explorer: url,
  explorerToken: (c: string) => `${url}/token/${c}`,
  explorerTx: (h: string) => `${url}/tx/${h}`,
  explorerAddress: (a: string) => `${url}/address/${a}`,
});

export const CHAINS: Record<ChainId, ChainInfo> = {
  solana: {
    id: 'solana',
    family: 'solana',
    name: 'Solana',
    dexscreener: 'solana',
    explorer: 'https://solscan.io',
    explorerToken: (c) => `https://solscan.io/token/${c}`,
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    explorerAddress: (a) => `https://solscan.io/account/${a}`,
    rpcEnv: ['SOLANA_RPC_URL', 'SOLANA_RPC_FALLBACK'],
  },
  robinhood: {
    id: 'robinhood',
    family: 'evm',
    name: 'Robinhood Chain',
    dexscreener: 'robinhood',
    ...evmExplorer('https://robinhoodchain.blockscout.com'),
    evm: robinhood,
    rpcEnv: ['RPC_ROBINHOOD_PRIMARY', 'RPC_ROBINHOOD_FALLBACK'],
  },
  base: {
    id: 'base',
    family: 'evm',
    name: 'Base',
    dexscreener: 'base',
    ...evmExplorer('https://basescan.org'),
    evm: base,
    rpcEnv: ['RPC_BASE_PRIMARY', 'RPC_BASE_FALLBACK'],
  },
  bsc: {
    id: 'bsc',
    family: 'evm',
    name: 'BNB Chain',
    dexscreener: 'bsc',
    ...evmExplorer('https://bscscan.com'),
    evm: bsc,
    rpcEnv: ['RPC_BSC_PRIMARY', 'RPC_BSC_FALLBACK'],
  },
};

export function isChainId(value: string): value is ChainId {
  return (CHAIN_IDS as readonly string[]).includes(value);
}

/** EVM addresses are stored lowercase; Solana base58 is case-sensitive and kept as-is. */
export function normalizeAddress(family: ChainFamily, address: string) {
  return family === 'evm' ? address.toLowerCase() : address;
}
