import { CHAINS, type ChainId } from '@apecam/chain';
import { streams, tokens } from '@apecam/db';
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { terminateStream } from './streams';
import { quoteColumns } from './tokens';
import { syncViewerCount } from './webhooks';

/** refresh-prices (every minute): tokens with a live stream first, then the 200 most valuable recently seen. */
export async function refreshPrices(deps: CoreDeps) {
  const now = deps.now?.() ?? new Date();
  const liveTokens = await deps.db
    .selectDistinct({ id: tokens.id, chain: tokens.chain, contract: tokens.contract })
    .from(tokens)
    .innerJoin(streams, eq(streams.tokenId, tokens.id))
    .where(eq(streams.status, 'live'));
  const recent = await deps.db
    .select({ id: tokens.id, chain: tokens.chain, contract: tokens.contract })
    .from(tokens)
    .where(and(eq(tokens.hidden, false), gte(tokens.updatedAt, new Date(now.getTime() - 24 * 3600_000))))
    .orderBy(desc(sql`coalesce(${tokens.marketCapUsd}, 0)`))
    .limit(200);

  const byChain = new Map<ChainId, Map<string, string>>();
  for (const t of [...liveTokens, ...recent]) {
    const chain = t.chain as ChainId;
    if (!byChain.has(chain)) byChain.set(chain, new Map());
    byChain.get(chain)!.set(t.contract, t.id);
  }

  let updated = 0;
  for (const [chain, contracts] of byChain) {
    const quotes = await deps.prices.refresh(CHAINS[chain].dexscreener, [...contracts.keys()]);
    for (const [contract, quote] of quotes) {
      if (!quote) continue;
      await deps.db
        .update(tokens)
        .set(quoteColumns(quote, now))
        .where(eq(tokens.id, contracts.get(contract)!));
      updated++;
    }
  }
  return { tokens: [...byChain.values()].reduce((n, m) => n + m.size, 0), updated };
}

/**
 * stale-streams (every minute):
 * - `starting` for over 2 minutes without a published track → ended (error);
 * - `live` whose LiveKit room no longer exists → ended (missed room_finished webhook);
 * - otherwise reconcile viewer counts in case join/leave webhooks were lost.
 */
export async function sweepStreams(deps: CoreDeps) {
  const now = deps.now?.() ?? new Date();
  const candidates = await deps.db
    .select()
    .from(streams)
    .where(
      or(
        and(eq(streams.status, 'starting'), lt(streams.createdAt, new Date(now.getTime() - 120_000))),
        eq(streams.status, 'live'),
      ),
    );

  const summary = { expired: 0, orphaned: 0, synced: 0 };
  for (const stream of candidates) {
    if (stream.status === 'starting') {
      await terminateStream(deps, stream, 'ended', 'error');
      summary.expired++;
    } else if (!(await deps.streaming.roomExists(stream.livekitRoom))) {
      await terminateStream(deps, stream, 'ended', 'disconnected');
      summary.orphaned++;
    } else {
      await syncViewerCount(deps, stream.id, stream.livekitRoom, stream.userId);
      summary.synced++;
    }
  }
  return summary;
}
