/**
 * Spike S2 — DexScreener as price source (ADR 002).
 * Answers: is Robinhood Chain listed and under which chainId slug? do pump.fun / Pons / Flap tokens
 * have prices? does the batch endpoint accept 30 addresses? which pair do we pick?
 */
const API = 'https://api.dexscreener.com';

type Pair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  labels?: string[];
};

async function get<T>(path: string): Promise<{ ms: number; status: number; body: T; limit?: string | null }> {
  const t = performance.now();
  const res = await fetch(API + path);
  const body = (await res.json()) as T;
  return {
    ms: Math.round(performance.now() - t),
    status: res.status,
    body,
    limit: res.headers.get('x-ratelimit-limit'),
  };
}

function summarize(pairs: Pair[]) {
  const byChain = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byChain.has(p.chainId)) byChain.set(p.chainId, new Set());
    byChain.get(p.chainId)!.add(p.dexId);
  }
  return [...byChain].map(([c, d]) => `${c}[${[...d].join(',')}]`).join(' ');
}

async function main() {
  // 1. Which chain slug does Robinhood Chain use, and which DEXes/launchpads show up?
  const queries = ['robinhood', 'pons', 'HOOD', 'WETH robinhood'];
  const rhPairs: Pair[] = [];
  for (const q of queries) {
    const r = await get<{ pairs: Pair[] | null }>(`/latest/dex/search?q=${encodeURIComponent(q)}`);
    const pairs = r.body.pairs ?? [];
    console.log(`search "${q}": ${r.status} ${r.ms}ms, ${pairs.length} pairs → ${summarize(pairs)}`);
    rhPairs.push(...pairs.filter((p) => /robin/i.test(p.chainId)));
  }
  const rhSlug = rhPairs[0]?.chainId;
  console.log(
    `Robinhood Chain slug: ${rhSlug ?? 'NOT FOUND'}; dexIds: ${[...new Set(rhPairs.map((p) => p.dexId))].join(', ') || '-'}`,
  );

  // 2. pump.fun (Solana) and Flap (BNB) tokens.
  for (const q of ['pump', 'flap']) {
    const r = await get<{ pairs: Pair[] | null }>(`/latest/dex/search?q=${q}`);
    console.log(`search "${q}": ${summarize(r.body.pairs ?? [])}`);
  }

  // 3. Batch endpoint with up to 30 addresses on Solana (pump.fun tokens from latest profiles).
  const profiles = await get<{ chainId: string; tokenAddress: string }[]>('/token-profiles/latest/v1');
  console.log(
    `token-profiles/latest: ${profiles.status} ${profiles.ms}ms, x-ratelimit-limit=${profiles.limit}`,
  );
  const sol = [
    ...new Set(profiles.body.filter((p) => p.chainId === 'solana').map((p) => p.tokenAddress)),
  ].slice(0, 30);
  if (sol.length) {
    const batch = await get<Pair[]>(`/tokens/v1/solana/${sol.join(',')}`);
    const tokens = new Set(batch.body.map((p) => p.baseToken.address));
    console.log(
      `tokens/v1/solana batch of ${sol.length}: ${batch.status} ${batch.ms}ms, ${batch.body.length} pairs covering ${tokens.size} tokens, dexIds=${[...new Set(batch.body.map((p) => p.dexId))].join(',')}`,
    );

    // Pair selection rule: highest liquidity per token.
    const first = sol.find((a) => batch.body.filter((p) => p.baseToken.address === a).length > 1);
    if (first) {
      const ps = batch.body.filter((p) => p.baseToken.address === first);
      const best = ps.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
      console.log(
        `token with ${ps.length} pairs → pick ${best.dexId} liquidity $${best.liquidity?.usd} price $${best.priceUsd}`,
      );
    }
    const noLiq = batch.body.filter((p) => p.liquidity?.usd === undefined).length;
    console.log(`pairs without liquidity field: ${noLiq} (bonding-curve tokens may have none)`);
  }

  // 4. Batch on Robinhood Chain.
  if (rhSlug) {
    const addrs = [...new Set(rhPairs.map((p) => p.baseToken.address))].slice(0, 30);
    const batch = await get<Pair[]>(`/tokens/v1/${rhSlug}/${addrs.join(',')}`);
    console.log(
      `tokens/v1/${rhSlug} batch of ${addrs.length}: ${batch.status} ${batch.ms}ms, ${batch.body.length} pairs`,
    );
    const sample = batch.body[0];
    if (sample)
      console.log(
        `sample: ${sample.baseToken.symbol} dex=${sample.dexId} price=$${sample.priceUsd} liq=$${sample.liquidity?.usd} mcap=$${sample.marketCap} url=${sample.url}`,
      );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
