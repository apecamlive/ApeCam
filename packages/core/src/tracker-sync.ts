import { buybacks, burns, syncCursors, treasuryTransfers } from '@apecam/db';
import { holdingUsdValue } from '@apecam/pricing';
import { classifyTransfers, DEAD_ADDRESS, nextWindow, ZERO_ADDRESS } from '@apecam/tracker';
import { ApiError } from '@apecam/shared';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { LogLimitError, type ApecamConfig, type CoreDeps } from './deps';
import { totalPaidOut } from './payouts';

const CURSOR = 'tracker:robinhood';
/** ADR 001: filtered getLogs over 5M blocks returned ~7k logs; start at 1M and halve on "too many logs". */
const INITIAL_WINDOW = 1_000_000;
const MIN_WINDOW = 1_000;
/** Bound one run so a long backfill never blocks the worker; the next run continues from the cursor. */
const MAX_WINDOWS_PER_RUN = 25;

function internalWallets(a: ApecamConfig) {
  return [a.wallets.creatorFee, a.wallets.operations];
}

/**
 * sync-tracker (every 5 min, S3-6): reads $APECAM Transfer logs up to the `safe` block (no reorg handling
 * needed below it), classifies them, and stores buybacks, burns and treasury transfers. Read-only: it never
 * holds keys or sends transactions. Idempotent on (tx_hash, log_index); resumes from `sync_cursors`.
 */
export async function syncTracker(deps: CoreDeps) {
  const apecam = deps.apecam;
  if (!apecam) return { skipped: 'APECAM contract and wallets not configured' };
  const [cursor] = await deps.db.select().from(syncCursors).where(eq(syncCursors.name, CURSOR));
  let from = (cursor?.lastBlock ?? apecam.deployBlock - 1) + 1;
  const head = await apecam.source.safeBlock();
  const quote = await deps.prices.getQuote('robinhood', apecam.contract).catch(() => null);
  const blockTimes = new Map<number, Date>();
  const timeOf = async (b: number) => {
    if (!blockTimes.has(b)) blockTimes.set(b, await apecam.source.blockTime(b));
    return blockTimes.get(b)!;
  };
  const usd = (raw: bigint) => (quote ? holdingUsdValue(raw, 18, quote.priceUsd).toFixed(2) : null);

  let size = INITIAL_WINDOW;
  const totals = { windows: 0, buybacks: 0, burns: 0, treasuryTransfers: 0, toBlock: from - 1 };
  for (
    let w = nextWindow(from, head, size);
    w && totals.windows < MAX_WINDOWS_PER_RUN;
    w = nextWindow(from, head, size)
  ) {
    let logs;
    try {
      logs = await apecam.source.transferLogs(w.from, w.to);
    } catch (err) {
      if (err instanceof LogLimitError && size > MIN_WINDOW) {
        size = Math.max(MIN_WINDOW, Math.floor(size / 2));
        continue;
      }
      throw err;
    }
    const buybackTxs = logs
      .filter((l) => l.to.toLowerCase() === apecam.wallets.buyback.toLowerCase())
      .map((l) => l.txHash);
    const outflows = buybackTxs.length
      ? await apecam.source.outflows(apecam.wallets.buyback, buybackTxs, w.from, w.to)
      : [];
    const {
      buybacks: bb,
      burns: bn,
      treasuryOut,
    } = classifyTransfers(
      logs,
      {
        buyback: apecam.wallets.buyback,
        burnAddresses: [apecam.wallets.burn, DEAD_ADDRESS, ZERO_ADDRESS],
        treasury: apecam.wallets.treasury,
        internal: internalWallets(apecam),
      },
      outflows,
    );

    for (const b of bb) {
      await deps.db
        .insert(buybacks)
        .values({
          txHash: b.txHash,
          logIndex: b.logIndex,
          blockNumber: b.blockNumber,
          apecamAmount: b.apecamAmount.toString(),
          spentAmount: b.spentAmount.toString(),
          spentAsset: b.spentAsset,
          usdValue: usd(b.apecamAmount),
          // USD at indexing time (§9); the spent asset amount is the exact on-chain figure.
          avgPriceUsd: quote?.priceUsd ?? null,
          final: true,
          boughtAt: await timeOf(b.blockNumber),
        })
        .onConflictDoNothing();
    }
    for (const b of bn) {
      await deps.db
        .insert(burns)
        .values({
          txHash: b.txHash,
          logIndex: b.logIndex,
          blockNumber: b.blockNumber,
          fromAddress: b.from,
          amount: b.amount.toString(),
          usdValue: usd(b.amount),
          final: true,
          burnedAt: await timeOf(b.blockNumber),
        })
        .onConflictDoNothing();
    }
    for (const t of treasuryOut) {
      await deps.db
        .insert(treasuryTransfers)
        .values({
          txHash: t.txHash,
          logIndex: t.logIndex,
          blockNumber: t.blockNumber,
          toAddress: t.to,
          amount: t.amount.toString(),
          blockTime: await timeOf(t.blockNumber),
        })
        .onConflictDoNothing();
    }

    await deps.db
      .insert(syncCursors)
      .values({ name: CURSOR, lastBlock: w.to, updatedAt: deps.now?.() ?? new Date() })
      .onConflictDoUpdate({
        target: syncCursors.name,
        set: { lastBlock: w.to, updatedAt: deps.now?.() ?? new Date() },
      });
    totals.windows++;
    totals.buybacks += bb.length;
    totals.burns += bn.length;
    totals.treasuryTransfers += treasuryOut.length;
    totals.toBlock = w.to;
    from = w.to + 1;
    size = INITIAL_WINDOW;
  }
  await deps.kv.del('tracker:summary');
  return totals;
}

const SUMMARY_CACHE_SEC = 60;

/** `/burn` headline numbers — everything derived from chain data (§9). */
export async function trackerSummary(deps: CoreDeps) {
  const apecam = deps.apecam;
  if (!apecam)
    throw new ApiError(
      503,
      'TRACKER_NOT_CONFIGURED',
      'The tracker starts once $APECAM is deployed and configured',
    );
  const cached = await deps.kv.get('tracker:summary');
  if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof buildSummary>>;
  const summary = await buildSummary(deps, apecam);
  await deps.kv.set('tracker:summary', JSON.stringify(summary), SUMMARY_CACHE_SEC);
  return summary;
}

async function buildSummary(deps: CoreDeps, apecam: ApecamConfig) {
  const src = apecam.source;
  const walletEntries = Object.entries(apecam.wallets) as [keyof ApecamConfig['wallets'], string][];
  const [totalSupply, burnBalance, ...walletBalances] = await Promise.all([
    src.totalSupply(),
    src.balanceOf(apecam.wallets.burn),
    ...walletEntries.map(([, a]) => src.balanceOf(a)),
  ]);
  // Burned = tokens destroyed by burn() (supply shrank) + tokens parked at the burn address.
  const destroyed = apecam.initialSupply > totalSupply ? apecam.initialSupply - totalSupply : 0n;
  const burned = destroyed + burnBalance;
  const circulating = totalSupply - burnBalance;

  const [bb] = await deps.db
    .select({
      apecam: sql<string>`coalesce(sum(${buybacks.apecamAmount}), 0)::text`,
      usd: sql<string>`coalesce(sum(${buybacks.usdValue}), 0)::text`,
      last: sql<Date | null>`max(${buybacks.boughtAt})`,
    })
    .from(buybacks);
  const [bn] = await deps.db
    .select({
      indexed: sql<string>`coalesce(sum(${burns.amount}), 0)::text`,
      last: sql<Date | null>`max(${burns.burnedAt})`,
    })
    .from(burns);
  const [cursor] = await deps.db.select().from(syncCursors).where(eq(syncCursors.name, CURSOR));

  // Indexed burns should equal what sits at the burn address (plus burn() destructions): a gap means missed logs.
  const indexedBurned = BigInt(bn!.indexed);
  if (indexedBurned !== burned && cursor) {
    deps.log?.warn(
      { indexed: indexedBurned.toString(), onChain: burned.toString() },
      'tracker burn total differs from chain',
    );
  }

  return {
    boughtBackRaw: bb!.apecam,
    boughtBackUsd: bb!.usd,
    burnedRaw: burned.toString(),
    burnedPercent: Number((burned * 1_000_000n) / apecam.initialSupply) / 10_000,
    totalSupplyRaw: totalSupply.toString(),
    circulatingRaw: circulating.toString(),
    treasuryRaw: walletBalances[walletEntries.findIndex(([k]) => k === 'treasury')]!.toString(),
    paidOutRaw: (await totalPaidOut(deps)).toString(),
    lastBuybackAt: bb!.last ? new Date(bb!.last).toISOString() : null,
    lastBurnAt: bn!.last ? new Date(bn!.last).toISOString() : null,
    lastSyncedAt: cursor?.updatedAt.toISOString() ?? null,
    syncedToBlock: cursor?.lastBlock ?? null,
    burnIndexMatchesChain: indexedBurned === burned,
    contract: apecam.contract,
    wallets: walletEntries.map(([role, address], i) => ({
      role,
      address,
      balanceRaw: walletBalances[i]!.toString(),
    })),
  };
}

/** Daily chart: buyback and burn amounts per UTC day. */
export async function trackerDaily(deps: CoreDeps, days = 90) {
  const since = new Date((deps.now?.() ?? new Date()).getTime() - days * 24 * 3600_000);
  const bb = await deps.db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${buybacks.boughtAt}), 'YYYY-MM-DD')`,
      raw: sql<string>`sum(${buybacks.apecamAmount})::text`,
    })
    .from(buybacks)
    .where(gte(buybacks.boughtAt, since))
    .groupBy(sql`1`);
  const bn = await deps.db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${burns.burnedAt}), 'YYYY-MM-DD')`,
      raw: sql<string>`sum(${burns.amount})::text`,
    })
    .from(burns)
    .where(gte(burns.burnedAt, since))
    .groupBy(sql`1`);
  const days_ = new Map<string, { day: string; buybackRaw: string; burnRaw: string }>();
  for (const r of bb) days_.set(r.day, { day: r.day, buybackRaw: r.raw, burnRaw: '0' });
  for (const r of bn)
    days_.set(r.day, { ...(days_.get(r.day) ?? { day: r.day, buybackRaw: '0' }), burnRaw: r.raw });
  return [...days_.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export async function listBuybacks(deps: CoreDeps, cursor = 0, limit = 25) {
  const rows = await deps.db
    .select()
    .from(buybacks)
    .orderBy(desc(buybacks.blockNumber), desc(buybacks.logIndex))
    .limit(limit + 1)
    .offset(cursor);
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? cursor + limit : null };
}

export async function listBurns(deps: CoreDeps, cursor = 0, limit = 25) {
  const rows = await deps.db
    .select()
    .from(burns)
    .orderBy(desc(burns.blockNumber), desc(burns.logIndex))
    .limit(limit + 1)
    .offset(cursor);
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? cursor + limit : null };
}
