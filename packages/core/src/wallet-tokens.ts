import { CHAINS, CHAIN_IDS, HoldingsUnsupportedError, type ChainId } from '@apecam/chain';
import { tokens, wallets } from '@apecam/db';
import { holdingUsdValue } from '@apecam/pricing';
import { ApiError } from '@apecam/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { CoreDeps } from './deps';

export interface WalletToken {
  chain: ChainId;
  contract: string;
  ticker: string | null;
  name: string | null;
  logoUrl: string | null;
  usdValue: string | null;
}

const CACHE_SEC = 120;
/** Price lookups per request are capped; dust and airdrop spam beyond this is not worth pricing. */
const MAX_PRICED = 40;

/**
 * Tokens a wallet holds, most valuable first (Studio token picker, S2-1). Hidden tokens are left out.
 * Chains whose RPC cannot enumerate balances are reported in `unsupported` so the UI offers paste-CA.
 */
export async function listWalletTokens(deps: CoreDeps, args: { userId: string; walletId: string }) {
  const [wallet] = await deps.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, args.walletId), eq(wallets.userId, args.userId)));
  if (!wallet) throw new ApiError(404, 'WALLET_NOT_FOUND', 'Wallet not found');

  const cacheKey = `holdings:${wallet.id}`;
  const cached = await deps.kv.get(cacheKey);
  if (cached) return JSON.parse(cached) as { tokens: WalletToken[]; unsupported: ChainId[] };

  const chains = CHAIN_IDS.filter((c) => CHAINS[c].family === wallet.chainFamily);
  const unsupported: ChainId[] = [];
  const found: { chain: ChainId; contract: string; rawBalance: bigint; decimals: number }[] = [];
  await Promise.all(
    chains.map(async (chain) => {
      try {
        for (const h of await deps.chains.get(chain).listHoldings(wallet.address))
          found.push({ chain, ...h });
      } catch (err) {
        if (err instanceof HoldingsUnsupportedError) unsupported.push(chain);
        else deps.log?.warn({ chain, err: String(err) }, 'listHoldings failed');
      }
    }),
  );

  const known = found.length
    ? await deps.db
        .select()
        .from(tokens)
        .where(inArray(tokens.contract, [...new Set(found.map((f) => f.contract))]))
    : [];
  const meta = new Map(known.map((t) => [`${t.chain}:${t.contract}`, t]));

  const priced = await Promise.all(
    found.slice(0, MAX_PRICED).map(async (f) => {
      const row = meta.get(`${f.chain}:${f.contract}`);
      if (row?.hidden) return null;
      const quote = await deps.prices.getQuote(CHAINS[f.chain].dexscreener, f.contract).catch(() => null);
      const usd = quote ? holdingUsdValue(f.rawBalance, f.decimals, quote.priceUsd) : null;
      return {
        chain: f.chain,
        contract: f.contract,
        ticker: row?.ticker ?? quote?.ticker ?? null,
        name: row?.name ?? quote?.name ?? null,
        logoUrl: row?.logoUrl ?? quote?.imageUrl ?? null,
        usdValue: usd ? usd.toFixed(2) : null,
        sort: usd ? usd.toNumber() : -1,
      };
    }),
  );
  const result = {
    tokens: priced
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => b.sort - a.sort)
      .map(({ sort: _sort, ...t }) => t),
    unsupported,
  };
  await deps.kv.set(cacheKey, JSON.stringify(result), CACHE_SEC);
  return result;
}
