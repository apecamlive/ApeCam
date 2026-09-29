import { CHAIN_IDS } from '@apecam/chain';
import { checkEligibility } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  chain: z.enum(CHAIN_IDS),
  contract: z.string().min(20).max(64),
  walletId: z.uuid(),
});

export const POST = route(async (req, _ctx, deps) => {
  const session = await requireSession(req, deps);
  const body = await parseBody(req, Body);
  const { result, token } = await checkEligibility(deps, { userId: session.userId, ...body });
  return {
    ...result,
    token: {
      chain: token.chain,
      contract: token.contract,
      ticker: token.ticker,
      name: token.name,
      logoUrl: token.logoUrl,
    },
  };
});
