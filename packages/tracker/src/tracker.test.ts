import { describe, expect, it } from 'vitest';
import {
  classifyTransfers,
  DEAD_ADDRESS,
  nextWindow,
  ZERO_ADDRESS,
  type Outflow,
  type TransferLog,
} from './index';

// Fixture wallets (lowercase and mixed case on purpose).
const W = {
  buyback: '0xBbBb000000000000000000000000000000000001',
  treasury: '0x7777000000000000000000000000000000000002',
  ops: '0x0000000000000000000000000000000000000a03',
  creator: '0x0000000000000000000000000000000000000c04',
  pool: '0x9999000000000000000000000000000000000005',
  streamer: '0x5555000000000000000000000000000000000006',
};
const wallets = {
  buyback: W.buyback,
  burnAddresses: [DEAD_ADDRESS, ZERO_ADDRESS],
  treasury: W.treasury,
  internal: [W.ops, W.creator],
};
const E18 = 10n ** 18n;
let n = 0;
const log = (
  from: string,
  to: string,
  value: bigint,
  txHash = `0xtx${++n}`,
  logIndex = 0,
  blockNumber = 100 + n,
): TransferLog => ({
  txHash,
  logIndex,
  blockNumber,
  from,
  to,
  value,
});

describe('tracker parser', () => {
  it('T-S3-U9 · buyback paid with ETH: APECAM from the pool + ETH out of the buyback wallet', () => {
    const l = log(W.pool, W.buyback, 1_000_000n * E18);
    const outflows: Outflow[] = [{ txHash: l.txHash, asset: 'ETH', raw: 2n * E18, decimals: 18 }];
    const { buybacks, burns, treasuryOut } = classifyTransfers([l], wallets, outflows);
    expect(buybacks).toEqual([
      {
        txHash: l.txHash,
        logIndex: 0,
        blockNumber: l.blockNumber,
        apecamAmount: 1_000_000n * E18,
        spentAsset: 'ETH',
        spentAmount: 2n * E18,
        spentDecimals: 18,
      },
    ]);
    expect(burns).toEqual([]);
    expect(treasuryOut).toEqual([]);
  });

  it('T-S3-U10 · buyback paid with WETH; small ETH gas dust is ignored as the spent asset', () => {
    const l = log(W.pool, W.buyback, 500n * E18);
    const outflows: Outflow[] = [
      { txHash: l.txHash, asset: 'WETH', raw: 3n * E18, decimals: 18 },
      { txHash: l.txHash, asset: 'ETH', raw: 1n, decimals: 18 },
    ];
    expect(classifyTransfers([l], wallets, outflows).buybacks[0]).toMatchObject({
      spentAsset: 'WETH',
      spentAmount: 3n * E18,
    });
  });

  it('a multi-hop route delivering APECAM in two logs is one buyback', () => {
    const tx = '0xmultihop';
    const logs = [
      log(W.pool, W.buyback, 100n * E18, tx, 3, 500),
      log(W.pool, W.buyback, 50n * E18, tx, 7, 500),
    ];
    const { buybacks } = classifyTransfers(logs, wallets, [
      { txHash: tx, asset: 'ETH', raw: E18, decimals: 18 },
    ]);
    expect(buybacks).toHaveLength(1);
    expect(buybacks[0]).toMatchObject({ apecamAmount: 150n * E18, logIndex: 3 });
  });

  it('T-S3-U11 · burns to the dead address and to 0x0 are both recorded, from anyone', () => {
    const a = log(W.buyback, DEAD_ADDRESS, 10n * E18);
    const b = log(W.streamer, ZERO_ADDRESS.toUpperCase().replace('0X', '0x'), 5n * E18);
    const { burns } = classifyTransfers([a, b], wallets, []);
    expect(burns.map((x) => [x.from, x.amount])).toEqual([
      [W.buyback.toLowerCase(), 10n * E18],
      [W.streamer, 5n * E18],
    ]);
  });

  it('T-S3-U12 · two burn transfers in one tx → two rows (distinct log index)', () => {
    const tx = '0xtwoburns';
    const { burns } = classifyTransfers(
      [log(W.buyback, DEAD_ADDRESS, E18, tx, 1, 900), log(W.buyback, DEAD_ADDRESS, 2n * E18, tx, 4, 900)],
      wallets,
      [],
    );
    expect(burns.map((b) => b.logIndex)).toEqual([1, 4]);
  });

  it('T-S3-U13 · ordinary transfers are ignored: gifts to the buyback wallet, internal moves, trades', () => {
    const gift = log(W.streamer, W.buyback, E18); // no outflow in the tx → not a buyback
    const internalMove = log(W.ops, W.buyback, E18);
    const trade = log(W.pool, W.streamer, E18);
    const treasuryToOps = log(W.treasury, W.ops, E18); // housekeeping, not a payout
    const res = classifyTransfers([gift, internalMove, trade, treasuryToOps], wallets, [
      { txHash: internalMove.txHash, asset: 'ETH', raw: E18, decimals: 18 },
    ]);
    expect(res).toEqual({ buybacks: [], burns: [], treasuryOut: [] });
  });

  it('treasury payouts to streamers are recorded for sync-payouts', () => {
    const p = log(W.treasury, W.streamer, 3125n * E18);
    expect(classifyTransfers([p], wallets, []).treasuryOut).toEqual([
      { txHash: p.txHash, logIndex: 0, blockNumber: p.blockNumber, to: W.streamer, amount: 3125n * E18 },
    ]);
  });

  it('block windows never pass the head', () => {
    expect(nextWindow(100, 150, 1000)).toEqual({ from: 100, to: 150 });
    expect(nextWindow(100, 5000, 1000)).toEqual({ from: 100, to: 1099 });
    expect(nextWindow(151, 150, 1000)).toBeNull();
  });
});
