import { CHAIN_IDS } from '@apecam/chain';
import { getTokenPage } from '@apecam/core';
import { z } from 'zod';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Params = z.object({ chain: z.enum(CHAIN_IDS), contract: z.string().min(20).max(64) });

/** Token metadata + price + live streams (token room header and stream picker). */
export const GET = route(async (_req, ctx, deps) => {
  const { chain, contract } = Params.parse(await ctx.params);
  const { token, streams } = await getTokenPage(deps, chain, contract);
  return {
    token: {
      chain: token.chain,
      contract: token.contract,
      ticker: token.ticker,
      name: token.name,
      logoUrl: token.logoUrl,
      decimals: token.decimals,
      priceUsd: token.priceUsd,
      marketCapUsd: token.marketCapUsd,
      change24h: token.change24h,
      chartUrl: token.chartUrl,
      buyUrl: token.buyUrl,
    },
    streams,
  };
});
