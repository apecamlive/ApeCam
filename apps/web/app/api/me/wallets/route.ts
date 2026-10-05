import { linkWallet } from '@apecam/core';
import { z } from 'zod';
import { verifySignIn } from '@/lib/server/auth';
import { parseBody, requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  family: z.enum(['evm', 'solana']),
  message: z.string().min(1).max(2000),
  signature: z.string().min(1).max(500),
});

/**
 * Link another wallet to the signed-in account (S2-6). The new wallet proves ownership with the same
 * plain-text sign-in message (fresh nonce); the existing session decides which account it joins.
 */
export const POST = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    const body = await parseBody(req, Body);
    const signer = await verifySignIn(deps.kv, deps.auth, body, deps.now?.() ?? new Date());
    const wallet = await linkWallet(deps, {
      userId: session.userId,
      family: signer.family,
      address: signer.address,
    });
    return {
      wallet: {
        id: wallet.id,
        family: wallet.chainFamily,
        address: wallet.address,
        isPayout: wallet.isPayout,
      },
    };
  },
  { rateLimit: LIMITS.wallets },
);
