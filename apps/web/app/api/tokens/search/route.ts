import { searchTokens } from '@apecam/core';
import { DexScreenerClient } from '@apecam/pricing';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const dex = new DexScreenerClient();

/** Ticker or contract address search across chains (S1-11). */
export const GET = route(async (req, _ctx, deps) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const results = await searchTokens(
    {
      ...deps,
      findPairsByAddress: async (address) =>
        (await dex.search(address)).map((p) => ({ chainSlug: p.chainId })),
    },
    q.slice(0, 64),
  );
  return { results };
});
