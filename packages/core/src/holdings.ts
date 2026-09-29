import { CHAINS, ChainRpcError, TokenNotFoundError, type ChainId } from '@apecam/chain';
import { holdingChecks, streams, tokens, wallets } from '@apecam/db';
import { holdingUsdValue } from '@apecam/pricing';
import { and, desc, eq } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { identity, terminateStream, type StreamRow } from './streams';

export type RecheckOutcome =
  'passed' | 'warned' | 'still_warning' | 'cut' | 'rpc_error' | 'skipped' | 'error';

/**
 * "Cut the Cam" (Dev Brief, streamer flow step 7). Runs every ~30s from the worker:
 * - a stream is re-checked when its last check is older than the interval, or while it is in warning;
 * - failing → 60s warning sent to the streamer; still failing after the warning → stream is cut;
 * - RPC/price errors are not treated as failures until they repeat (a flaky RPC must not cut everyone).
 */
export async function recheckHoldings(deps: CoreDeps) {
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const intervalMs = config['go_live.recheck_interval_sec'] * 1000;

  const live = await deps.db
    .select({ stream: streams, wallet: wallets, token: tokens })
    .from(streams)
    .innerJoin(wallets, eq(wallets.id, streams.walletId))
    .innerJoin(tokens, eq(tokens.id, streams.tokenId))
    .where(eq(streams.status, 'live'));

  const results: { streamId: string; outcome: RecheckOutcome }[] = [];
  for (const { stream, wallet, token } of live) {
    const [last] = await deps.db
      .select({ checkedAt: holdingChecks.checkedAt })
      .from(holdingChecks)
      .where(eq(holdingChecks.streamId, stream.id))
      .orderBy(desc(holdingChecks.checkedAt))
      .limit(1);
    const due =
      !last || now.getTime() - last.checkedAt.getTime() >= intervalMs || stream.warningUntil !== null;
    if (!due) {
      results.push({ streamId: stream.id, outcome: 'skipped' });
      continue;
    }
    // One broken stream must never stop the others from being checked.
    try {
      results.push({ streamId: stream.id, outcome: await recheckOne(deps, { stream, wallet, token, now }) });
    } catch (err) {
      deps.log?.error({ streamId: stream.id, err: String(err) }, 'holding recheck failed');
      results.push({ streamId: stream.id, outcome: 'error' });
    }
  }
  return results;
}

async function recheckOne(
  deps: CoreDeps,
  ctx: {
    stream: StreamRow;
    wallet: typeof wallets.$inferSelect;
    token: typeof tokens.$inferSelect;
    now: Date;
  },
): Promise<RecheckOutcome> {
  const { stream, wallet, token, now } = ctx;
  const config = await deps.config();
  const chain = token.chain as ChainId;

  let passed: boolean;
  try {
    // A wallet/contract the chain rejects cannot hold the minimum: that is a failed check, not an outage.
    const holding = await deps.chains
      .get(chain)
      .getBalance(wallet.address, token.contract)
      .catch((err) => {
        if (err instanceof TokenNotFoundError)
          return { contract: token.contract, rawBalance: 0n, decimals: 0 };
        throw err;
      });
    const quote = await deps.prices.getQuote(CHAINS[chain].dexscreener, token.contract);
    if (!quote) throw new ChainRpcError('price unavailable');
    const usd = holdingUsdValue(holding.rawBalance, holding.decimals, quote.priceUsd);
    passed = usd.gte(config['go_live.min_usd']);
    await deps.db.insert(holdingChecks).values({
      streamId: stream.id,
      walletId: wallet.id,
      tokenId: token.id,
      rawBalance: holding.rawBalance.toString(),
      priceUsd: quote.priceUsd,
      usdValue: usd.toFixed(2),
      passed,
      checkedAt: now,
    });
  } catch (err) {
    if (!(err instanceof ChainRpcError)) throw err;
    const failures = stream.rpcFailures + 1;
    await deps.db.update(streams).set({ rpcFailures: failures }).where(eq(streams.id, stream.id));
    deps.log?.warn({ streamId: stream.id, failures, err: err.message }, 'holding recheck: rpc error');
    if (failures < config['go_live.rpc_failures_before_cut']) return 'rpc_error';
    passed = false;
  }

  if (passed) {
    await deps.db
      .update(streams)
      .set({ warningUntil: null, rpcFailures: 0 })
      .where(eq(streams.id, stream.id));
    if (stream.warningUntil) await notify(deps, stream, { type: 'holding_ok' });
    return 'passed';
  }

  if (!stream.warningUntil) {
    const warningUntil = new Date(now.getTime() + config['go_live.cut_warning_sec'] * 1000);
    await deps.db
      .update(streams)
      .set({ warningUntil })
      .where(and(eq(streams.id, stream.id), eq(streams.status, 'live')));
    await notify(deps, stream, {
      type: 'holding_warning',
      cutAt: warningUntil.toISOString(),
      minUsd: config['go_live.min_usd'],
    });
    return 'warned';
  }
  if (now < stream.warningUntil) return 'still_warning';

  await notify(deps, stream, { type: 'holding_cut' });
  await terminateStream(deps, stream, 'cut', 'holding_failed');
  return 'cut';
}

async function notify(deps: CoreDeps, stream: StreamRow, payload: object) {
  await deps.streaming
    .sendData(stream.livekitRoom, 'system', payload, [identity.publisher(stream.userId)])
    .catch((err) => deps.log?.warn({ err: String(err), streamId: stream.id }, 'sendData failed'));
}
