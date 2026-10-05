/**
 * Classifies $APECAM on-chain activity into buybacks, burns and treasury payouts (Implementation Plan §9).
 * Pure functions: the indexer job fetches logs and outflows, this decides what they mean.
 */

export interface TransferLog {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  from: string;
  to: string;
  value: bigint;
}

/** Something that left the buyback wallet in a transaction (ETH, WETH, a stablecoin…). */
export interface Outflow {
  txHash: string;
  asset: string;
  raw: bigint;
  decimals: number;
}

export interface TrackerWallets {
  buyback: string;
  /** The burn address plus the zero address (tokens with a `burn()` send there). */
  burnAddresses: string[];
  treasury: string;
  /** Owner wallets: APECAM moving between them is housekeeping, not a buyback. */
  internal: string[];
}

export interface BuybackRecord {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  apecamAmount: bigint;
  spentAsset: string;
  spentAmount: bigint;
  spentDecimals: number;
}

export interface BurnRecord {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  from: string;
  amount: bigint;
}

export interface TreasuryTransfer {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  to: string;
  amount: bigint;
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

const lc = (a: string) => a.toLowerCase();

export function classifyTransfers(logs: TransferLog[], wallets: TrackerWallets, outflows: Outflow[]) {
  const buyback = lc(wallets.buyback);
  const treasury = lc(wallets.treasury);
  const burnSet = new Set(wallets.burnAddresses.map(lc));
  const internal = new Set([...wallets.internal, wallets.treasury, wallets.buyback].map(lc));

  const outflowByTx = new Map<string, Outflow[]>();
  for (const o of outflows) {
    const key = lc(o.txHash);
    outflowByTx.set(key, [...(outflowByTx.get(key) ?? []), o]);
  }

  const burns: BurnRecord[] = [];
  const treasuryOut: TreasuryTransfer[] = [];
  const buybackByTx = new Map<string, BuybackRecord>();

  for (const log of [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)) {
    const from = lc(log.from);
    const to = lc(log.to);
    if (log.value === 0n) continue;

    if (burnSet.has(to)) {
      burns.push({
        txHash: log.txHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        from,
        amount: log.value,
      });
      continue;
    }
    if (from === treasury && !internal.has(to)) {
      treasuryOut.push({
        txHash: log.txHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        to,
        amount: log.value,
      });
      continue;
    }
    // A buyback is APECAM arriving at the buyback wallet from outside (a pool/router) in a transaction
    // where the buyback wallet also paid something. A plain incoming transfer is not a buyback.
    if (to === buyback && !internal.has(from)) {
      const paid = outflowByTx.get(lc(log.txHash));
      if (!paid?.length) continue;
      const existing = buybackByTx.get(lc(log.txHash));
      if (existing) {
        existing.apecamAmount += log.value; // multi-hop routes can deliver in several logs
        continue;
      }
      // Largest outflow is what was spent; gas-only dust in another asset is ignored.
      const main = paid.reduce((a, b) =>
        (b.raw * 10n ** 18n) / 10n ** BigInt(b.decimals) > (a.raw * 10n ** 18n) / 10n ** BigInt(a.decimals)
          ? b
          : a,
      );
      buybackByTx.set(lc(log.txHash), {
        txHash: log.txHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        apecamAmount: log.value,
        spentAsset: main.asset,
        spentAmount: paid.filter((p) => p.asset === main.asset).reduce((s, p) => s + p.raw, 0n),
        spentDecimals: main.decimals,
      });
    }
  }
  return { buybacks: [...buybackByTx.values()], burns, treasuryOut };
}

/** Largest block window that stays under the RPC's 10,000-log / 10M-block limits (ADR 001). */
export function nextWindow(from: number, head: number, size: number) {
  const to = Math.min(head, from + size - 1);
  return to >= from ? { from, to } : null;
}
