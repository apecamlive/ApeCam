/**
 * Spike S1 — Robinhood Chain (ADR 001).
 * Answers: is the RPC usable for eth_getLogs? which block tags exist for finality?
 * can the explorer list a wallet's tokens and a tx's internal transactions?
 */
import { createPublicClient, defineChain, http, parseAbiItem } from 'viem';
import { enableDohForBlockedHosts } from './doh';

enableDohForBlockedHosts();

const RPC = process.env.RPC_ROBINHOOD_PRIMARY ?? 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_API = 'https://robinhoodchain.blockscout.com/api/v2';

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});

const client = createPublicClient({
  chain: robinhood,
  transport: http(RPC, { timeout: 30_000, retryCount: 0 }),
});
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const r = await fn();
  return [r, Math.round(performance.now() - t)];
}

async function main() {
  const [chainId, msChain] = await timed(() => client.getChainId());
  const latest = await client.getBlock({ blockTag: 'latest' });
  const old = await client.getBlock({ blockNumber: latest.number - 10_000n });
  const blockTime = Number(latest.timestamp - old.timestamp) / 10_000;
  console.log(
    `chainId=${chainId} (${msChain}ms) head=${latest.number} avgBlockTime=${blockTime.toFixed(3)}s`,
  );

  for (const tag of ['safe', 'finalized'] as const) {
    try {
      const b = await client.getBlock({ blockTag: tag });
      const lagBlocks = latest.number - b.number;
      const lagSec = Number(latest.timestamp - b.timestamp);
      console.log(`blockTag=${tag}: block ${b.number}, lag ${lagBlocks} blocks / ${lagSec}s`);
    } catch (e) {
      console.log(`blockTag=${tag}: ERROR ${(e as Error).message.split('\n')[0]}`);
    }
  }

  // eth_getLogs: all ERC-20 Transfer events (no address filter = worst case) over growing ranges.
  let sampleLog: { address: string; to?: string; tx: string } | undefined;
  for (const range of [1_000n, 5_000n, 10_000n, 50_000n, 100_000n]) {
    try {
      const [logs, ms] = await timed(() =>
        client.getLogs({ event: transfer, fromBlock: latest.number - range, toBlock: latest.number }),
      );
      console.log(`getLogs(all Transfer) range=${range}: ${logs.length} logs, ${ms}ms`);
      const l = logs.at(-1);
      if (l && !sampleLog) sampleLog = { address: l.address, to: l.args.to, tx: l.transactionHash };
    } catch (e) {
      console.log(`getLogs range=${range}: ERROR ${(e as Error).message.split('\n')[0]?.slice(0, 160)}`);
    }
  }

  // Same, filtered by one token contract (what sync-tracker actually does).
  if (sampleLog) {
    for (const range of [100_000n, 500_000n, 1_000_000n]) {
      try {
        const [logs, ms] = await timed(() =>
          client.getLogs({
            address: sampleLog!.address as `0x${string}`,
            event: transfer,
            fromBlock: latest.number - range,
            toBlock: latest.number,
          }),
        );
        console.log(`getLogs(one token) range=${range}: ${logs.length} logs, ${ms}ms`);
      } catch (e) {
        console.log(
          `getLogs(one token) range=${range}: ERROR ${(e as Error).message.split('\n')[0]?.slice(0, 160)}`,
        );
      }
    }
  }

  // Explorer (Blockscout) capabilities.
  const get = async (path: string) => {
    const [res, ms] = await timed(() => fetch(EXPLORER_API + path));
    const body = res.ok ? await res.json() : await res.text();
    return { status: res.status, ms, body };
  };
  const stats = await get('/stats');
  console.log(`explorer /stats: ${stats.status} ${stats.ms}ms`);
  if (sampleLog?.to) {
    const tokens = await get(`/addresses/${sampleLog.to}/tokens?type=ERC-20`);
    const items = (tokens.body as { items?: unknown[] }).items;
    console.log(
      `explorer /addresses/{addr}/tokens: ${tokens.status} ${tokens.ms}ms, items=${items?.length ?? 'n/a'}`,
    );
    if (items?.[0]) console.log('  sample item keys:', Object.keys(items[0] as object).join(', '));
  }
  if (sampleLog) {
    const internal = await get(`/transactions/${sampleLog.tx}/internal-transactions`);
    const items = (internal.body as { items?: unknown[] }).items;
    console.log(
      `explorer /transactions/{tx}/internal-transactions: ${internal.status} ${internal.ms}ms, items=${items?.length ?? 'n/a'}`,
    );
    const tt = await get(`/transactions/${sampleLog.tx}/token-transfers`);
    console.log(`explorer /transactions/{tx}/token-transfers: ${tt.status} ${tt.ms}ms`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
