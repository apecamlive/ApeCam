import { robinhood } from '@apecam/chain';
import type { Outflow, TransferLog } from '@apecam/tracker';
import { createPublicClient, erc20Abi, fallback, http, parseAbiItem, type PublicClient } from 'viem';
import { LogLimitError, type ApecamChainSource, type ApecamConfig } from './deps';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

/**
 * $APECAM on Robinhood Chain through viem (logs, balances, `safe` block) and Alchemy's Transfers API
 * (what the buyback wallet paid, including internal ETH transfers; ADR 001). Read-only.
 */
export class RobinhoodApecamSource implements ApecamChainSource {
  private readonly client: PublicClient;

  constructor(
    private readonly contract: `0x${string}`,
    rpcUrls: string[],
  ) {
    const urls = rpcUrls.length ? rpcUrls : robinhood.rpcUrls.default.http;
    this.client = createPublicClient({
      chain: robinhood,
      transport: fallback(urls.map((u) => http(u, { timeout: 20_000, retryCount: 2 }))),
    });
  }

  async safeBlock() {
    return Number((await this.client.getBlock({ blockTag: 'safe' })).number);
  }

  async blockTime(block: number) {
    const b = await this.client.getBlock({ blockNumber: BigInt(block) });
    return new Date(Number(b.timestamp) * 1000);
  }

  async transferLogs(fromBlock: number, toBlock: number): Promise<TransferLog[]> {
    try {
      const logs = await this.client.getLogs({
        address: this.contract,
        event: TRANSFER,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });
      return logs.map((l) => ({
        txHash: l.transactionHash,
        logIndex: l.logIndex,
        blockNumber: Number(l.blockNumber),
        from: l.args.from!.toLowerCase(),
        to: l.args.to!.toLowerCase(),
        value: l.args.value!,
      }));
    } catch (err) {
      // "logs matched by query exceeds limit of 10000" / "query spans … blocks" (ADR 001).
      if (/exceeds limit|narrow the block range|too many/i.test(String((err as Error).message))) {
        throw new LogLimitError(String((err as Error).message));
      }
      throw err;
    }
  }

  async outflows(
    address: string,
    txHashes: string[],
    fromBlock: number,
    toBlock: number,
  ): Promise<Outflow[]> {
    const wanted = new Set(txHashes.map((h) => h.toLowerCase()));
    const out: Outflow[] = [];
    let pageKey: string | undefined;
    do {
      const res = (await this.client.request({
        method: 'alchemy_getAssetTransfers' as never,
        params: [
          {
            fromAddress: address,
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            category: ['external', 'internal', 'erc20'],
            withMetadata: false,
            excludeZeroValue: true,
            pageKey,
          },
        ] as never,
      })) as {
        transfers: {
          hash: string;
          asset: string | null;
          rawContract: { value: string | null; decimal: string | null };
        }[];
        pageKey?: string;
      };
      for (const t of res.transfers) {
        if (!wanted.has(t.hash.toLowerCase()) || !t.rawContract.value) continue;
        out.push({
          txHash: t.hash,
          asset: t.asset ?? 'UNKNOWN',
          raw: BigInt(t.rawContract.value),
          decimals: t.rawContract.decimal ? Number(BigInt(t.rawContract.decimal)) : 18,
        });
      }
      pageKey = res.pageKey;
    } while (pageKey);
    return out;
  }

  balanceOf(address: string) {
    return this.client.readContract({
      address: this.contract,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });
  }

  totalSupply() {
    return this.client.readContract({ address: this.contract, abi: erc20Abi, functionName: 'totalSupply' });
  }
}

/** Tracker config from env; null until the owner provides every address (D17). */
export function apecamConfigFromEnv(env: Record<string, string | undefined>): ApecamConfig | null {
  const need = [
    'APECAM_CONTRACT',
    'WALLET_CREATOR_FEE',
    'WALLET_OPERATIONS',
    'WALLET_BUYBACK',
    'WALLET_BURN',
    'WALLET_TREASURY',
    'APECAM_DEPLOY_BLOCK',
  ] as const;
  if (need.some((k) => !env[k])) return null;
  const lc = (k: (typeof need)[number]) => env[k]!.toLowerCase();
  const contract = lc('APECAM_CONTRACT') as `0x${string}`;
  const rpc = [env.RPC_ROBINHOOD_PRIMARY, env.RPC_ROBINHOOD_FALLBACK].filter((u): u is string => !!u);
  return {
    contract,
    wallets: {
      creatorFee: lc('WALLET_CREATOR_FEE'),
      operations: lc('WALLET_OPERATIONS'),
      buyback: lc('WALLET_BUYBACK'),
      burn: lc('WALLET_BURN'),
      treasury: lc('WALLET_TREASURY'),
    },
    deployBlock: Number(env.APECAM_DEPLOY_BLOCK),
    initialSupply: BigInt(env.APECAM_INITIAL_SUPPLY_RAW ?? (10n ** 9n * 10n ** 18n).toString()),
    source: new RobinhoodApecamSource(contract, rpc),
  };
}
